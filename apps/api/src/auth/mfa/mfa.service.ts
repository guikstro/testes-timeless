import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { confereCodigo, enderecoOtpAuth, geraSegredo } from "./totp";
import { AuditoriaService } from "../../auditoria/auditoria.service";
import {
  encontraCodigo,
  geraLote,
  hashDoCodigo,
  QUANTIDADE,
} from "./codigos-de-recuperacao";

const EMISSOR = "Timeless";

export interface InscricaoIniciada {
  segredo: string;
  endereco: string;
}

export interface SituacaoDoMfa {
  ativo: boolean;
  /** Segredo gerado e ainda não provado: a inscrição ficou pela metade. */
  pendente: boolean;
  codigosRestantes: number;
  /** Obrigatório para operadores da plataforma. Ver `PlatformAdminGuard`. */
  exigido: boolean;
}

/**
 * Segundo fator: inscrição, conferência e desligamento.
 *
 * Três decisões organizam este serviço:
 *
 * 1. **O segredo só passa a valer depois de provado.** A inscrição gera e
 *    guarda, mas `confirmadoEm` fica nulo até a pessoa digitar um código que
 *    bate. Ligar o fator na geração trancaria quem fechasse a aba no meio.
 *
 * 2. **Os códigos de recuperação nascem junto com a confirmação, e aparecem
 *    uma vez só.** Entregá-los antes seria entregar a chave de uma fechadura
 *    que ainda não existe; guardá-los recuperáveis seria não tê-los como
 *    segredo.
 *
 * 3. **Desligar custa o mesmo que ligar.** Senha e um código válido. Um
 *    segundo fator que sai só com a sessão aberta protege contra roubo de
 *    senha e não contra roubo de sessão, que é metade do problema.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async situacao(userId: string): Promise<SituacaoDoMfa> {
    const [mfa, restantes, usuario] = await Promise.all([
      this.prisma.userMfa.findUnique({ where: { userId } }),
      this.prisma.mfaRecoveryCode.count({ where: { userId, usadoEm: null } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } }),
    ]);

    return {
      ativo: mfa?.confirmadoEm != null,
      pendente: mfa != null && mfa.confirmadoEm == null,
      codigosRestantes: restantes,
      exigido: usuario?.platformRole != null,
    };
  }

  /**
   * Gera um segredo novo e devolve o endereço para o QR.
   *
   * Chamar de novo com uma inscrição pendente **substitui** o segredo, em vez
   * de reaproveitar: quem recomeça é porque perdeu o QR ou trocou de aparelho,
   * e devolver o segredo antigo faria a tela mostrar um código que o
   * autenticador novo não reconhece.
   *
   * Com o fator já ativo, recusa. Trocar de aparelho é desligar e ligar de
   * novo, e isso precisa passar pela senha.
   */
  async iniciarInscricao(userId: string): Promise<InscricaoIniciada> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfa: { select: { confirmadoEm: true } } },
    });

    if (!usuario) {
      throw new AppException("NOT_FOUND", "Usuário não encontrado.", HttpStatus.NOT_FOUND);
    }
    if (usuario.mfa?.confirmadoEm) {
      throw new AppException(
        "MFA_JA_ATIVO",
        "A verificação em duas etapas já está ativa. Desative antes de configurar outro aparelho.",
        HttpStatus.CONFLICT,
      );
    }

    const segredo = geraSegredo();
    await this.prisma.userMfa.upsert({
      where: { userId },
      create: { userId, secretEncrypted: this.encryption.encrypt(segredo) },
      update: { secretEncrypted: this.encryption.encrypt(segredo), ultimoPassoUsado: null },
    });

    return { segredo, endereco: enderecoOtpAuth(EMISSOR, usuario.email, segredo) };
  }

  /**
   * Confirma a inscrição e devolve os códigos de recuperação.
   *
   * Esta é a única vez que os códigos existem em texto. Quem fechar a tela
   * sem guardá-los precisa gerar outros.
   */
  async confirmarInscricao(userId: string, codigo: string): Promise<{ codigos: string[] }> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });

    if (!mfa) {
      throw new AppException(
        "MFA_SEM_INSCRICAO",
        "Comece a configuração antes de confirmar o código.",
        HttpStatus.CONFLICT,
      );
    }
    if (mfa.confirmadoEm) {
      throw new AppException("MFA_JA_ATIVO", "A verificação em duas etapas já está ativa.", HttpStatus.CONFLICT);
    }

    const resultado = confereCodigo(this.encryption.decrypt(mfa.secretEncrypted), codigo, undefined, mfa.ultimoPassoUsado);
    if (!resultado.valido) {
      throw new AppException(
        "MFA_CODIGO_INVALIDO",
        "Código inválido. Confira o horário do aparelho e tente o código atual.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const codigos = geraLote();

    /*
      Numa transação: confirmar o fator e criar os códigos precisam acontecer
      juntos. Confirmado sem códigos deixa a pessoa sem saída se perder o
      telefone; códigos sem confirmação é segredo entregue à toa.
    */
    await this.prisma.$transaction([
      this.prisma.userMfa.update({
        where: { userId },
        data: { confirmadoEm: new Date(), ultimoPassoUsado: resultado.passo },
      }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codigos.map((codigo) => ({ userId, codeHash: hashDoCodigo(codigo) })),
      }),
    ]);

    await this.auditoria.registraParaAPessoa(userId, { acao: "MFA_ENABLED", entidade: "User", entidadeId: userId });
    return { codigos };
  }

  /**
   * Confere um código no login. Aceita o do aplicativo ou um de recuperação.
   *
   * Devolve se passou, e nada sobre por quê: distinguir "código errado" de
   * "código de recuperação já usado" ajudaria mais quem está tentando entrar
   * do que quem está tentando defender.
   */
  async confereSegundoFator(userId: string, codigo: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.confirmadoEm) return false;

    const doAplicativo = confereCodigo(
      this.encryption.decrypt(mfa.secretEncrypted),
      codigo,
      undefined,
      mfa.ultimoPassoUsado,
    );

    if (doAplicativo.valido) {
      // Grava o passo antes de liberar: é o que impede o mesmo código de
      // servir de novo dentro da mesma janela.
      await this.prisma.userMfa.update({ where: { userId }, data: { ultimoPassoUsado: doAplicativo.passo } });
      return true;
    }

    const guardados = await this.prisma.mfaRecoveryCode.findMany({ where: { userId } });
    const usado = encontraCodigo(guardados, codigo);
    if (!usado) return false;

    await this.prisma.mfaRecoveryCode.update({ where: { id: usado.id }, data: { usadoEm: new Date() } });
    return true;
  }

  /**
   * Gera outro lote, invalidando o anterior por inteiro.
   *
   * Não acrescenta aos que restam: quem pede um lote novo é porque o antigo
   * pode ter sido visto, e deixar os dois valendo manteria justamente o
   * risco que motivou o pedido.
   */
  async regenerarCodigos(userId: string, codigo: string): Promise<{ codigos: string[] }> {
    if (!(await this.confereSegundoFator(userId, codigo))) {
      throw new AppException("MFA_CODIGO_INVALIDO", "Código inválido.", HttpStatus.UNAUTHORIZED);
    }

    const codigos = geraLote();
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codigos.map((c) => ({ userId, codeHash: hashDoCodigo(c) })),
      }),
    ]);

    // Os códigos em si nunca vão para o registro: só o fato de terem mudado.
    await this.auditoria.registraParaAPessoa(userId, {
      acao: "MFA_CODES_REGENERATED",
      entidade: "User",
      entidadeId: userId,
    });
    return { codigos };
  }

  /**
   * Desliga o fator. Some com o segredo e com os códigos.
   *
   * Quem chama já conferiu a senha: ver `AuthService.desativarMfa`. Os dois
   * juntos são o ponto, porque um fator que sai só com a sessão aberta
   * protege contra roubo de senha e não contra roubo de sessão.
   */
  async desativar(userId: string, codigo: string): Promise<void> {
    if (!(await this.confereSegundoFator(userId, codigo))) {
      throw new AppException("MFA_CODIGO_INVALIDO", "Código inválido.", HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.userMfa.deleteMany({ where: { userId } }),
    ]);
  }

  /** Cancela uma inscrição que não chegou a ser confirmada. */
  async cancelarInscricao(userId: string): Promise<void> {
    await this.prisma.userMfa.deleteMany({ where: { userId, confirmadoEm: null } });
  }

  /** Quantos códigos ainda valem, para a tela avisar antes de acabarem. */
  contaCodigos(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usadoEm: null } });
  }
}

export { QUANTIDADE as CODIGOS_POR_LOTE };
