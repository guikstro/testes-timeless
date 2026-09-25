import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { AcaoNoAnuncio, MudancaNoAnuncio, NivelDoAnuncio } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { META_SYNC_QUEUE } from "../../common/queue/queue.constants";
import { MetaSyncJob } from "../../common/queue/meta-sync.job";
import { BudgetsService } from "../../budgets/budgets.service";
import { MetaGraphClient } from "./meta-graph-client";
import { MetaApiError } from "./meta-api-error";
import { AuditoriaService, autorDe } from "../../auditoria/auditoria.service";
import {
  confereOrcamentoDiario,
  planejaMudancaDeStatus,
  podeEscreverNaConta,
  StatusNaMeta,
} from "./controle-de-anuncios";

/**
 * Escrita na conta de anúncios: pausar, ativar e mudar orçamento diário.
 *
 * Tudo aqui é construído em volta de um fato: ao contrário do resto do
 * produto, um defeito nesta classe não gera um número errado numa tela, gera
 * uma cobrança errada no cartão do cliente. Daí as quatro travas:
 *
 * 1. **Papel.** Só OWNER e ADMIN. Ver `podeEscreverNaConta`.
 * 2. **Escopo na consulta, não numa conferência depois.** Anúncio e conjunto
 *    não carregam organização, então a busca desce pela campanha. Um escopo
 *    esquecido não devolve nada; uma conferência esquecida vaza.
 * 3. **Verba.** Orçamento que consome o saldo antes do fim do período é
 *    recusado, e só passa com confirmação explícita.
 * 4. **Rastro antes da chamada.** A linha do histórico nasce antes de falar
 *    com a Meta e é fechada depois. Se a chamada cair no meio, fica
 *    registrado que a tentativa existiu: mudança aplicada lá sem linha nenhuma
 *    aqui é o pior resultado possível.
 */
@Injectable()
export class ControleDeAnunciosService {
  private readonly logger = new Logger(ControleDeAnunciosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly meta: MetaGraphClient,
    private readonly verbas: BudgetsService,
    @InjectQueue(META_SYNC_QUEUE) private readonly syncQueue: Queue<MetaSyncJob>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async mudarStatus(
    user: AuthenticatedUser,
    nivel: NivelDoAnuncio,
    externalId: string,
    desejado: StatusNaMeta,
  ) {
    this.exigePermissao(user);
    const alvo = await this.alvoOuErro(user.organizationId, nivel, externalId);
    const token = await this.tokenOuErro(user.organizationId);

    const plano = planejaMudancaDeStatus(alvo.status, desejado);
    if (!plano.precisaEscrever) {
      // Clique duplo ou dois operadores agindo junto. Não é erro, e não merece
      // uma linha dizendo que alguém mudou o que não mudou.
      return { alterado: false, status: alvo.status, aviso: null };
    }

    const acao: AcaoNoAnuncio = desejado === "PAUSED" ? "PAUSAR" : "ATIVAR";
    const registro = await this.abreRegistro(user, nivel, externalId, alvo, acao, plano.de, plano.para);

    await this.aplica(user, registro, () => this.meta.atualizarStatus(externalId, token, desejado));
    await this.gravaLocal(nivel, alvo.id, { status: desejado });
    await this.pedeSincronia(user.organizationId);

    return { alterado: true, status: desejado, aviso: null };
  }

  async mudarOrcamentoDiario(
    user: AuthenticatedUser,
    externalId: string,
    centavos: number,
    confirmado: boolean,
  ) {
    this.exigePermissao(user);
    const alvo = await this.alvoOuErro(user.organizationId, "CONJUNTO", externalId);
    const token = await this.tokenOuErro(user.organizationId);

    /*
      A conferência contra a verba acontece aqui, e não na tela.

      A tela é onde o aviso aparece; a regra é onde ela não pode ser burlada.
      Um segundo cliente da API, ou um clique repetido depois de a verba mudar,
      passariam direto por uma validação que só existisse no navegador.
    */
    const veredicto = confereOrcamentoDiario(
      centavos,
      await this.verbas.resumo(user.organizationId),
      confirmado,
    );
    if (!veredicto.permitido) {
      throw new AppException("ORCAMENTO_ESTOURA_VERBA", veredicto.motivo, HttpStatus.BAD_REQUEST);
    }

    const registro = await this.abreRegistro(
      user,
      "CONJUNTO",
      externalId,
      alvo,
      "ORCAMENTO_DIARIO",
      // O valor anterior fica nulo de propósito: não guardamos orçamento na
      // nossa cópia, e inventar um "de" a partir de nada seria pior que a
      // ausência dele no histórico.
      null,
      String(centavos),
    );

    await this.aplica(user, registro, () =>
      this.meta.atualizarOrcamentoDiario(externalId, token, centavos),
    );
    await this.pedeSincronia(user.organizationId);

    return { alterado: true, orcamentoDiarioCentavos: centavos, aviso: veredicto.aviso };
  }

  /** O histórico de escrita da organização, do mais recente para o mais antigo. */
  historico(organizationId: string) {
    return this.prisma.mudancaNoAnuncio.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        nivel: true,
        externalId: true,
        nome: true,
        acao: true,
        de: true,
        para: true,
        aplicadoEm: true,
        erro: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });
  }

  private exigePermissao(user: AuthenticatedUser): void {
    if (!podeEscreverNaConta(user.role)) {
      throw new AppException(
        "SEM_PERMISSAO",
        "Só quem administra a organização pode pausar anúncios ou mudar orçamento.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Acha o objeto e prova que ele é desta organização, na mesma consulta.
   *
   * `Ad` e `AdSet` não têm `organizationId`: o vínculo existe só na campanha.
   * Descer por ela aqui é o que impede um id de outra conta de ser pausado
   * daqui.
   */
  private async alvoOuErro(
    organizationId: string,
    nivel: NivelDoAnuncio,
    externalId: string,
  ): Promise<{ id: string; nome: string; status: string }> {
    if (nivel === "CAMPANHA") {
      const campanha = await this.prisma.campaign.findFirst({
        where: { externalId, organizationId },
        select: { id: true, name: true, status: true },
      });
      return this.exigeAlvo(campanha && { id: campanha.id, nome: campanha.name, status: campanha.status });
    }

    if (nivel === "CONJUNTO") {
      const conjunto = await this.prisma.adSet.findFirst({
        where: { externalId, campaign: { organizationId } },
        select: { id: true, name: true, status: true },
      });
      return this.exigeAlvo(conjunto && { id: conjunto.id, nome: conjunto.name, status: conjunto.status });
    }

    const anuncio = await this.prisma.ad.findFirst({
      where: { externalId, adSet: { campaign: { organizationId } } },
      select: { id: true, name: true, status: true },
    });
    return this.exigeAlvo(anuncio && { id: anuncio.id, nome: anuncio.name, status: anuncio.status });
  }

  private exigeAlvo<T>(alvo: T | null | undefined | false): T {
    if (!alvo) {
      // Mesma resposta para "não existe" e "é de outro cliente": distinguir as
      // duas revelaria que o id existe em outra conta.
      throw new AppException(
        "NAO_ENCONTRADO",
        "Esse anúncio não foi encontrado nesta conta.",
        HttpStatus.NOT_FOUND,
      );
    }
    return alvo;
  }

  private async tokenOuErro(organizationId: string): Promise<string> {
    const conexao = await this.prisma.metaConnection.findUnique({ where: { organizationId } });
    if (!conexao || conexao.status !== "CONNECTED") {
      throw new AppException(
        "NOT_CONNECTED",
        "A conta de anúncios não está conectada. Reconecte a Meta para poder alterar anúncios.",
        HttpStatus.CONFLICT,
      );
    }
    return this.encryption.decrypt(conexao.accessTokenEncrypted);
  }

  private abreRegistro(
    user: AuthenticatedUser,
    nivel: NivelDoAnuncio,
    externalId: string,
    alvo: { nome: string },
    acao: AcaoNoAnuncio,
    de: string | null,
    para: string | null,
  ) {
    return this.prisma.mudancaNoAnuncio.create({
      data: {
        organizationId: user.organizationId,
        // Numa impersonação este é o operador da plataforma, que é quem de
        // fato agiu, e não alguém do cliente.
        userId: user.userId,
        nivel,
        externalId,
        // O nome copiado, e não buscado por relação: o anúncio pode ser
        // renomeado ou apagado depois, e um histórico que muda junto com o
        // presente não reconstitui o que foi feito.
        nome: alvo.nome,
        acao,
        de,
        para,
      },
    });
  }

  /**
   * Executa a escrita e fecha o registro, com sucesso ou com o motivo da
   * falha.
   *
   * O erro é traduzido antes de subir. "Falhou" não ajuda ninguém: faltar
   * `ads_management` no token, que é o caso mais comum aqui, tem conserto
   * conhecido e precisa dizer qual é.
   */
  private async aplica(
    user: AuthenticatedUser,
    registro: MudancaNoAnuncio,
    escrita: () => Promise<void>,
  ): Promise<void> {
    const registroId = registro.id;
    try {
      await escrita();
      await this.prisma.mudancaNoAnuncio.update({
        where: { id: registroId },
        data: { aplicadoEm: new Date() },
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.mudancaNoAnuncio.update({
        where: { id: registroId },
        data: { erro: motivo.slice(0, 500) },
      });

      if (erro instanceof MetaApiError && semPermissaoDeEscrita(erro)) {
        throw new AppException(
          "SEM_ADS_MANAGEMENT",
          "O token conectado não tem permissão de escrita (ads_management). Reconecte a Meta concedendo essa permissão.",
          HttpStatus.FORBIDDEN,
        );
      }

      throw new AppException("META_RECUSOU", `A Meta recusou a alteração: ${motivo}`, HttpStatus.BAD_GATEWAY);
    }

    // Só o que a Meta aceitou vai para a auditoria: a tentativa recusada já
    // fica no histórico de mudanças do anúncio, com o motivo.
    await this.auditoria.registra(autorDe(user), {
      acao: registro.acao === "ORCAMENTO_DIARIO" ? "AD_BUDGET_CHANGED" : "AD_STATUS_CHANGED",
      entidade: NOME_DO_NIVEL[registro.nivel],
      entidadeId: registro.externalId,
      antes: { nome: registro.nome, valor: registro.de },
      depois: { nome: registro.nome, valor: registro.para },
    });
  }

  /**
   * Escreve o novo estado na nossa cópia antes de a sincronia rodar.
   *
   * Sem isto a tela volta mostrando o status antigo até a próxima rodada, e
   * quem clicou fica sem saber se a ação valeu. A sincronia depois confirma ou
   * corrige: a fonte da verdade continua sendo a Meta.
   */
  private async gravaLocal(
    nivel: NivelDoAnuncio,
    id: string,
    data: { status: string },
  ): Promise<void> {
    if (nivel === "CAMPANHA") await this.prisma.campaign.update({ where: { id }, data });
    else if (nivel === "CONJUNTO") await this.prisma.adSet.update({ where: { id }, data });
    else await this.prisma.ad.update({ where: { id }, data });
  }

  /** Confirmação vem da Meta, não da nossa suposição de que deu certo. */
  private async pedeSincronia(organizationId: string): Promise<void> {
    try {
      await this.syncQueue.add(
        "sync",
        { organizationId },
        { attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true, removeOnFail: 20 },
      );
    } catch (erro) {
      // A escrita já aconteceu. Falhar aqui não pode desfazer nem mascarar
      // isso; a rodada de hora em hora corrige na sequência.
      this.logger.warn(`Alteração aplicada, mas a sincronia não pôde ser enfileirada: ${(erro as Error).message}`);
    }
  }
}

/**
 * A Meta sinaliza permissão faltando de mais de um jeito. O código 200 é o
 * documentado para "requires extended permission"; o 10 aparece quando o app
 * não passou pela revisão.
 */
function semPermissaoDeEscrita(erro: MetaApiError): boolean {
  return erro.code === 200 || erro.code === 10 || /permission/i.test(erro.message);
}

/** Como cada nível aparece na auditoria. */
const NOME_DO_NIVEL: Record<NivelDoAnuncio, string> = {
  CAMPANHA: "Campanha",
  CONJUNTO: "Conjunto de anúncios",
  ANUNCIO: "Anúncio",
};
