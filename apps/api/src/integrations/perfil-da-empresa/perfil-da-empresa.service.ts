import { InjectQueue } from "@nestjs/bullmq";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { AuditoriaService, autorDe } from "../../auditoria/auditoria.service";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { LEITURA_DO_PERFIL, PERFIL_DA_EMPRESA_QUEUE } from "../../common/queue/queue.constants";
import { LeituraDoPerfilJob } from "../../common/queue/perfil-da-empresa.job";
import { AcessoAoGoogle } from "./acesso-ao-google";
import { enderecoDeRetorno } from "./endereco-do-google";
import { ErroDoGoogle, explicaErroDoGoogle } from "./erro-do-google";
import { confereEstado, criaEstado } from "./estado-do-oauth";
import { enderecoLegivel, PerfilDaEmpresaClient } from "./perfil-da-empresa-client";
import { DIAS_DO_HISTORICO } from "./metricas-do-perfil";

export interface LocalDisponivel {
  localId: string;
  nome: string;
  endereco: string | null;
  /** O cliente que já usa este local, quando algum usa. */
  cliente: { id: string; nome: string } | null;
}

/** Um local por cliente, no máximo esta quantidade: uma rede maior é outro produto. */
const MAXIMO_DE_LOCAIS = 20;

/**
 * O Perfil da Empresa no Google, do lado da equipe: ligar a conta Google da
 * equipe e escolher o perfil de cada cliente.
 *
 * Tudo aqui é da administração. A lista de perfis da conta da equipe tem os
 * de todos os clientes, e não pode chegar à tela de nenhum deles.
 */
@Injectable()
export class PerfilDaEmpresaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly acesso: AcessoAoGoogle,
    private readonly client: PerfilDaEmpresaClient,
    private readonly auditoria: AuditoriaService,
    @InjectQueue(PERFIL_DA_EMPRESA_QUEUE) private readonly fila: Queue<LeituraDoPerfilJob>,
  ) {}

  async situacao() {
    const conta = await this.prisma.contaGoogleDaEquipe.findUnique({ where: { id: "equipe" } });
    return {
      configurado: this.acesso.configurado(),
      /** Para a equipe conferir com o cadastrado no Google Cloud. */
      enderecoDeRetorno: enderecoDeRetorno(),
      conta: conta ? { email: conta.email, conectadaEm: conta.conectadaEm.toISOString(), erro: conta.erro } : null,
    };
  }

  inicia(operador: AuthenticatedUser, volta: string | undefined): { url: string } {
    try {
      return { url: this.acesso.urlDeConsentimento(criaEstado(operador.userId, volta)) };
    } catch (erro) {
      throw this.recusa(erro);
    }
  }

  async conclui(operador: AuthenticatedUser, codigo: string, estado: string): Promise<{ volta: string; email: string | null }> {
    const conferido = confereEstado(estado, operador.userId);
    if (!conferido) {
      throw new AppException(
        "ESTADO_INVALIDO",
        "A volta do Google não confere com quem começou, ou demorou mais de 15 minutos. Comece de novo.",
        HttpStatus.BAD_REQUEST,
      );
    }

    let autorizacao;
    try {
      autorizacao = await this.acesso.trocaCodigo(codigo);
    } catch (erro) {
      // Na troca, `invalid_grant` é o código da volta vencido ou já usado, e
      // não uma conta sem acesso.
      if (erro instanceof ErroDoGoogle && erro.codigo === "invalid_grant") {
        throw new AppException(
          "GOOGLE_RECUSOU",
          "O Google recusou o código da volta: ele vence em minutos e vale uma vez só. Comece de novo.",
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (erro instanceof ErroDoGoogle && erro.codigo === "redirect_uri_mismatch") {
        throw new AppException(
          "GOOGLE_RECUSOU",
          `O endereço de retorno não confere com o cadastrado no Google Cloud. Cadastre exatamente ${enderecoDeRetorno()} no cliente OAuth.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw this.recusa(erro);
    }

    // Sem revogar o token anterior: reconectar a mesma conta e revogar o
    // velho derrubaria o novo junto, porque o Google revoga a autorização
    // inteira.
    const dados = {
      email: autorizacao.email,
      refreshTokenEncrypted: this.encryption.encrypt(autorizacao.refreshToken),
      escopos: autorizacao.escopos,
      conectadaPorId: operador.userId,
      conectadaEm: new Date(),
      erro: null,
    };
    await this.prisma.contaGoogleDaEquipe.upsert({ where: { id: "equipe" }, create: { id: "equipe", ...dados }, update: dados });
    this.acesso.esqueceAcesso();

    await this.auditoria.registra(autorDe(operador), {
      acao: "INTEGRATION_CONNECTED",
      entidade: "ContaGoogleDaEquipe",
      entidadeId: "equipe",
      depois: { integracao: "Perfil da Empresa no Google", conta: autorizacao.email },
    });

    // Quem já tinha perfil escolhido volta a ser lido agora, e não daqui a seis horas.
    const clientes = await this.prisma.localDoPerfil.findMany({ distinct: ["organizationId"], select: { organizationId: true } });
    for (const { organizationId } of clientes) await this.enfileira(organizationId);

    return { volta: conferido.volta, email: autorizacao.email };
  }

  async desconecta(operador: AuthenticatedUser): Promise<void> {
    const conta = await this.prisma.contaGoogleDaEquipe.findUnique({ where: { id: "equipe" } });
    if (!conta) return;
    await this.prisma.contaGoogleDaEquipe.delete({ where: { id: "equipe" } });
    await this.acesso.revoga(conta.refreshTokenEncrypted);
    await this.auditoria.registra(autorDe(operador), {
      acao: "INTEGRATION_DISCONNECTED",
      entidade: "ContaGoogleDaEquipe",
      entidadeId: "equipe",
      antes: { integracao: "Perfil da Empresa no Google", conta: conta.email },
    });
  }

  /**
   * Os locais que a conta da equipe enxerga, com o cliente de cada um. Pede
   * ao Google na hora: é a equipe escolhendo, uma vez por cliente.
   */
  async locaisDisponiveis(): Promise<{ locais: LocalDisponivel[]; contasRecusadas: number }> {
    let token: string;
    let contas;
    try {
      token = await this.acesso.token();
      contas = await this.client.contas(token);
    } catch (erro) {
      throw this.recusa(erro);
    }

    const achados = new Map<string, { nome: string; endereco: string | null }>();
    let contasRecusadas = 0;
    for (const conta of contas) {
      // Organização e grupo de usuários não guardam local: os filhos deles já estão na lista.
      if (conta.type === "ORGANIZATION" || conta.type === "USER_GROUP") continue;
      try {
        for (const local of await this.client.locais(token, conta.name)) {
          achados.set(local.name, { nome: local.title?.trim() || local.name, endereco: enderecoLegivel(local) });
        }
      } catch (erro) {
        if (!(erro instanceof ErroDoGoogle)) throw erro;
        // Uma conta sem permissão de listar não apaga as outras da tela.
        if (erro.status === 429 || erro.codigo === "RESOURCE_EXHAUSTED") throw this.recusa(erro);
        contasRecusadas++;
      }
    }

    const ligados = await this.prisma.localDoPerfil.findMany({
      where: { localId: { in: [...achados.keys()] } },
      select: { localId: true, organization: { select: { id: true, name: true } } },
    });
    const clienteDe = new Map(ligados.map((l) => [l.localId, { id: l.organization.id, nome: l.organization.name }]));

    const locais = [...achados.entries()]
      .map(([localId, local]) => ({ localId, ...local, cliente: clienteDe.get(localId) ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { locais, contasRecusadas };
  }

  async doCliente(organizationId: string) {
    await this.exigeCliente(organizationId);
    const locais = await this.prisma.localDoPerfil.findMany({ where: { organizationId }, orderBy: { nome: "asc" } });
    return {
      locais: locais.map((local) => ({
        localId: local.localId,
        nome: local.nome,
        endereco: local.endereco,
        numerosAte: local.numerosAte?.toISOString().slice(0, 10) ?? null,
        sincronizadoEm: local.sincronizadoEm?.toISOString() ?? null,
        erro: local.erro,
      })),
    };
  }

  /**
   * Define os locais do cliente: os que saem levam os números junto, e os que
   * entram trazem o histórico de um ano e meio.
   *
   * Os números do local que sai são apagados deste cliente: se ele foi ligado
   * aqui por engano, os números de outra empresa estavam no painel errado.
   */
  async defineLocais(operador: AuthenticatedUser, organizationId: string, localIds: string[]): Promise<void> {
    await this.exigeCliente(organizationId);
    const pedidos = [...new Set(localIds)];
    if (pedidos.length > MAXIMO_DE_LOCAIS) {
      throw new AppException("MUITOS_LOCAIS", `No máximo ${MAXIMO_DE_LOCAIS} perfis por cliente.`, HttpStatus.BAD_REQUEST);
    }

    const antes = await this.prisma.localDoPerfil.findMany({ where: { organizationId } });
    const novos = pedidos.filter((id) => !antes.some((local) => local.localId === id));

    // Só local que a conta da equipe enxerga: é o que impede ligar um id
    // qualquer, e é de onde vêm o nome e o endereço.
    let disponiveis = new Map<string, LocalDisponivel>();
    if (novos.length > 0) {
      disponiveis = new Map((await this.locaisDisponiveis()).locais.map((local) => [local.localId, local]));
      for (const id of novos) {
        const local = disponiveis.get(id);
        if (!local) {
          throw new AppException("LOCAL_DESCONHECIDO", "A conta Google da equipe não enxerga este perfil.", HttpStatus.BAD_REQUEST);
        }
        if (local.cliente && local.cliente.id !== organizationId) {
          throw new AppException(
            "LOCAL_DE_OUTRO_CLIENTE",
            `O perfil "${local.nome}" já está ligado ao cliente ${local.cliente.nome}. Tire de lá antes.`,
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    const saem = antes.filter((local) => !pedidos.includes(local.localId));
    await this.prisma.$transaction(async (tx) => {
      if (saem.length > 0) {
        const ids = saem.map((local) => local.localId);
        await tx.metricaLocal.deleteMany({ where: { organizationId, fonte: "PERFIL_DA_EMPRESA", escopo: { in: ids } } });
        await tx.localDoPerfil.deleteMany({ where: { organizationId, localId: { in: ids } } });
      }
      for (const id of novos) {
        const local = disponiveis.get(id)!;
        await tx.localDoPerfil.create({ data: { organizationId, localId: id, nome: local.nome.slice(0, 255), endereco: local.endereco } });
      }
    });

    if (saem.length === 0 && novos.length === 0) return;
    await this.auditoria.registra(
      { organizationId, userId: operador.userId, impersonating: true },
      {
        acao: "INTEGRATION_UPDATED",
        entidade: "LocalDoPerfil",
        entidadeId: organizationId,
        antes: { integracao: "Perfil da Empresa no Google", perfis: antes.map((local) => local.nome) },
        depois: {
          integracao: "Perfil da Empresa no Google",
          perfis: [
            ...antes.filter((local) => pedidos.includes(local.localId)).map((local) => local.nome),
            ...novos.map((id) => disponiveis.get(id)!.nome),
          ],
        },
      },
    );

    if (novos.length > 0) await this.enfileira(organizationId, DIAS_DO_HISTORICO);
  }

  /** "Ler agora": com histórico se algum local nunca foi lido. */
  async leAgora(organizationId: string): Promise<void> {
    await this.exigeCliente(organizationId);
    const nuncaLido = await this.prisma.localDoPerfil.count({ where: { organizationId, sincronizadoEm: null } });
    await this.enfileira(organizationId, nuncaLido > 0 ? DIAS_DO_HISTORICO : undefined);
  }

  private async enfileira(organizationId: string, dias?: number): Promise<void> {
    await this.fila.add(LEITURA_DO_PERFIL, dias ? { organizationId, dias } : { organizationId }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: 20,
    });
  }

  private async exigeCliente(organizationId: string): Promise<void> {
    const cliente = await this.prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true } });
    if (!cliente) throw new AppException("ORGANIZATION_NOT_FOUND", "Cliente não encontrado.", HttpStatus.NOT_FOUND);
  }

  /** A recusa do Google como resposta da API, com o próximo passo escrito. */
  private recusa(erro: unknown): unknown {
    if (!(erro instanceof ErroDoGoogle)) return erro;
    if (erro.codigo === "sem_credenciais") return new AppException("GOOGLE_NAO_CONFIGURADO", erro.message, HttpStatus.SERVICE_UNAVAILABLE);
    if (erro.codigo === "sem_conta") {
      return new AppException("GOOGLE_SEM_CONTA", "Conecte a conta Google da equipe primeiro.", HttpStatus.CONFLICT);
    }
    if (erro.codigo === "sem_refresh_token" || erro.codigo === "sem_escopo") {
      return new AppException("GOOGLE_RECUSOU", erro.message, HttpStatus.BAD_GATEWAY);
    }
    return new AppException("GOOGLE_RECUSOU", explicaErroDoGoogle(erro), HttpStatus.BAD_GATEWAY);
  }
}
