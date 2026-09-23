import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { MembershipRole } from "@prisma/client";
import { MfaService } from "./mfa/mfa.service";
import { decideRenovacao } from "./sessoes/decide-renovacao";
import { ContextoDoCliente } from "./sessoes/contexto-do-cliente";
import { slugify } from "../common/utils/slugify";
import { hashToken } from "../common/utils/hash-token";
import { isUniqueConstraintError } from "../common/utils/is-unique-constraint-error";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { enderecoDaAplicacao } from "../common/configuracao/ambiente";
import { EmailService } from "../common/email/email.service";
import { confirmacaoDeEmail, emailAlterado, recuperacaoDeSenha, senhaAlterada } from "../common/email/mensagens";
import { AuthenticatedUser, JwtPayload } from "./jwt-payload.interface";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
/**
 * Vinte e quatro horas, mais folgado que o de recuperação de senha.
 *
 * Recuperar senha é urgente e quem pediu está esperando; confirmar um e-mail
 * novo não é, e a pessoa pode só abrir aquela caixa no dia seguinte. Enquanto
 * o link não é aberto, nada muda, então a folga não abre risco nenhum.
 */
const EMAIL_CHANGE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const BCRYPT_ROUNDS = 12;

// Compared against on every login with an unknown e-mail so the bcrypt cost
// is paid regardless — otherwise response time leaks whether an account
// exists (real accounts take ~bcrypt-compare-time longer to reject).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * O que o login devolve quando a conta tem segundo fator.
 *
 * Nenhum token de sessão sai daqui: só uma permissão curta para apresentar o
 * código. Emitir a sessão antes do segundo fator e "completar" depois faria o
 * fator ser um aviso, não uma tranca.
 */
export interface DesafioDeSegundoFator {
  mfaObrigatorio: true;
  desafio: string;
}

export type ResultadoDeLogin = TokenPair | DesafioDeSegundoFator;

/**
 * Dois minutos para digitar seis dígitos já lidos do telefone.
 *
 * Curto de propósito: este token vale uma sessão inteira quando trocado, e
 * uma janela generosa aqui é uma janela para quem tiver a senha esperar
 * alguém desbloquear o telefone.
 */
const DESAFIO_MFA_TTL = "2m";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly mfa: MfaService,
  ) {}

  async register(dto: RegisterDto, contexto?: ContextoDoCliente): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppException("EMAIL_ALREADY_IN_USE", "Este e-mail já está em uso.", HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseSlug = slugify(dto.organizationName) || "org";

    // The findUnique-then-create checks above and below are not atomic, so
    // two identical requests can race past both checks; the unique
    // constraints are the real source of truth and P2002 here is expected,
    // not exceptional — without this catch it surfaced as a raw 500.
    let result: { user: { id: string }; membership: { organizationId: string; role: JwtPayload["role"] } };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        let slug = baseSlug;
        let suffix = 0;

        for (;;) {
          const collision = await tx.organization.findUnique({ where: { slug } });
          if (!collision) break;
          suffix += 1;
          slug = `${baseSlug}-${suffix}`;
        }

        const organization = await tx.organization.create({
          data: { name: dto.organizationName, slug },
        });

        const user = await tx.user.create({
          data: { name: dto.name, email: dto.email, passwordHash },
        });

        const membership = await tx.membership.create({
          data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
        });

        return { user, membership };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException("EMAIL_ALREADY_IN_USE", "Este e-mail já está em uso.", HttpStatus.CONFLICT);
      }
      throw error;
    }

    return this.issueTokenPair(result.user.id, result.membership.organizationId, result.membership.role, undefined, {
      contexto,
    });
  }

  async login(dto: LoginDto, contexto?: ContextoDoCliente): Promise<ResultadoDeLogin> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      // Vínculo com organização apagada não conta. Sem este filtro, entrar
      // funcionava e a sessão morria logo depois em `getSession`, que confere
      // isto: o resultado era um login que dava certo e uma tela que dizia
      // "sessão inválida", sem nada explicando por quê.
      include: {
        memberships: { where: { organization: { deletedAt: null } } },
        mfa: { select: { confirmadoEm: true } },
      },
    });

    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    // Conta desativada responde igual a e-mail que não existe, e depois de
    // pagar o mesmo custo de bcrypt: separar as duas respostas transformaria
    // o login num verificador de quem já teve conta aqui.
    if (!user || user.deletedAt || !passwordMatches) {
      throw new AppException("INVALID_CREDENTIALS", "E-mail ou senha inválidos.", HttpStatus.UNAUTHORIZED);
    }

    if (user.memberships.length === 0) {
      throw new AppException(
        "NO_ORGANIZATION",
        "Este usuário não pertence a nenhuma organização.",
        HttpStatus.FORBIDDEN,
      );
    }

    const membership = dto.organizationId
      ? user.memberships.find((m) => m.organizationId === dto.organizationId)
      : user.memberships[0];

    if (!membership) {
      throw new AppException(
        "ORGANIZATION_NOT_FOUND",
        "Organização não encontrada para este usuário.",
        HttpStatus.FORBIDDEN,
      );
    }

    /*
      Com segundo fator ativo, o login para aqui.

      `confirmadoEm` nulo não conta: um segredo gerado e nunca provado é uma
      configuração pela metade, e exigi-lo trancaria quem fechou a aba no meio
      da inscrição.
    */
    if (user.mfa?.confirmadoEm) {
      return {
        mfaObrigatorio: true,
        desafio: await this.jwt.signAsync(
          { sub: user.id, organizationId: membership.organizationId, role: membership.role, proposito: "mfa" },
          { expiresIn: DESAFIO_MFA_TTL },
        ),
      };
    }

    return this.issueTokenPair(user.id, membership.organizationId, membership.role, undefined, { contexto });
  }

  /**
   * Troca o desafio pelo par de tokens, contra um código válido.
   *
   * O desafio carrega organização e papel decididos no login, e não os aceita
   * de fora: sem isso, quem tivesse um desafio poderia pedir sessão em
   * qualquer organização.
   */
  async completarLogin(desafio: string, codigo: string, contexto?: ContextoDoCliente): Promise<TokenPair> {
    let payload: { sub: string; organizationId: string; role: MembershipRole; proposito?: string };
    try {
      payload = await this.jwt.verifyAsync(desafio);
    } catch {
      throw new AppException(
        "DESAFIO_EXPIRADO",
        "O tempo para confirmar o código acabou. Entre de novo.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Um token de sessão não serve como desafio, e vice-versa: sem esta
    // conferência, um access token roubado pularia o segundo fator.
    if (payload.proposito !== "mfa") {
      throw new AppException("DESAFIO_INVALIDO", "Requisição inválida.", HttpStatus.UNAUTHORIZED);
    }

    if (!(await this.mfa.confereSegundoFator(payload.sub, codigo))) {
      throw new AppException(
        "MFA_CODIGO_INVALIDO",
        "Código inválido. Use o código atual do aplicativo ou um código de recuperação.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenPair(payload.sub, payload.organizationId, payload.role, undefined, { contexto });
  }

  /**
   * Desliga o segundo fator: senha e código, os dois.
   *
   * Só o código bastaria para quem estivesse com a sessão aberta, e só a senha
   * bastaria para quem a tivesse roubado. Exigir os dois é o que faz desligar
   * custar o mesmo que o fator protege.
   */
  async desativarMfa(userId: string, senha: string, codigo: string): Promise<void> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!usuario || !(await bcrypt.compare(senha, usuario.passwordHash))) {
      throw new AppException("INVALID_CREDENTIALS", "Senha incorreta.", HttpStatus.UNAUTHORIZED);
    }

    await this.mfa.desativar(userId, codigo);
  }

  async refresh(refreshToken: string, contexto?: ContextoDoCliente): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { sessao: { select: { id: true, encerradaEm: true } } },
    });

    const veredicto = decideRenovacao(stored);

    /*
      Token reapresentado depois de rotacionado: alguém tem uma cópia.

      Não dá para saber se do outro lado está quem roubou ou quem foi roubado,
      e por isso a sessão inteira cai. A pessoa legítima entra de novo; quem
      roubou perde o que tinha. Ver `decideRenovacao` para a carência que
      impede isso de disparar numa corrida inocente entre duas abas.
    */
    if (veredicto === "reuso" && stored?.sessaoId) {
      await this.prisma.$transaction([
        this.prisma.sessao.update({
          where: { id: stored.sessaoId },
          data: { encerradaEm: new Date(), motivoDoEncerramento: "renovação reaproveitada" },
        }),
        this.prisma.refreshToken.updateMany({
          where: { sessaoId: stored.sessaoId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      this.logger.warn(
        JSON.stringify({ event: "sessao_encerrada_por_reuso", userId: stored.userId, sessaoId: stored.sessaoId }),
      );
    }

    if (veredicto !== "valido" || !stored) {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    // Encerrada por outra via, pela tela de sessões ou por troca de senha:
    // a renovação que sobrou não pode ressuscitá-la.
    if (stored.sessao?.encerradaEm) {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão encerrada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Preserva a impersonação, mas **nunca** estende o prazo dela: renovar
    // carrega adiante o mesmo `impersonationExpiresAt` original. É o que
    // impede uma visita a um cliente de virar acesso indefinido.
    const impersonation = payload.impersonating
      ? { expiresAt: payload.impersonationExpiresAt ?? 0 }
      : undefined;

    if (impersonation && impersonation.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new AppException(
        "IMPERSONATION_EXPIRED",
        "A sessão dentro do cliente expirou. Entre novamente pela administração.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (impersonation) {
      /*
        Visita de suporte: o operador não tem vínculo com a organização do
        cliente, então não há papel a reler. O que precisa ser reconferido é
        se ele ainda é operador da plataforma: revogar o acesso de alguém não
        pode esperar a visita dele terminar.
      */
      const operador = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { platformRole: true, deletedAt: true },
      });

      if (!operador?.platformRole || operador.deletedAt) {
        throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
      }

      return this.issueTokenPair(
        payload.sub,
        payload.organizationId,
        payload.role,
        impersonation,
        stored.sessaoId ? { id: stored.sessaoId } : { contexto },
      );
    }

    /*
      O papel vem do banco, nunca do token antigo.

      Renovar remontava o token a partir do papel que estava no token
      anterior, e isso tinha uma consequência que anulava a tela de equipe:
      rebaixar alguém de dono para membro não surtia efeito nenhum enquanto a
      pessoa mantivesse a sessão viva. Ela renovava sozinha a cada quinze
      minutos, sempre com o papel antigo, por até sete dias. Remover já
      revogava as sessões; rebaixar não, e o rebaixamento é justamente a ação
      pensada para quando não se quer expulsar ninguém.

      O vínculo também é reconferido aqui, e não só o papel: uma sessão de
      quem não está mais na organização não deve produzir token novo.
    */
    const vinculo = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: payload.organizationId, userId: payload.sub } },
      select: { role: true, user: { select: { deletedAt: true } } },
    });

    if (!vinculo || vinculo.user.deletedAt) {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    // Linha de antes das sessões existirem ganha sessão aqui, na primeira
    // renovação: quem já estava logado não é expulso pela mudança.
    return this.issueTokenPair(
      payload.sub,
      payload.organizationId,
      vinculo.role,
      undefined,
      stored.sessaoId ? { id: stored.sessaoId } : { contexto },
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { sessaoId: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Sair encerra a sessão, e não só a renovação: o token de acesso deste
    // aparelho precisa parar de valer agora, não daqui a quinze minutos.
    if (stored?.sessaoId) {
      await this.prisma.sessao.updateMany({
        where: { id: stored.sessaoId, encerradaEm: null },
        data: { encerradaEm: new Date(), motivoDoEncerramento: "saiu" },
      });
    }
  }

  /**
   * Always returns success regardless of whether the e-mail exists, to avoid
   * leaking account existence. O token só sai por e-mail, nunca na resposta.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    // `deletedAt` no filtro: uma conta desativada não recupera a si mesma de
    // volta para dentro do sistema.
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (!user) {
      return { message: "Se o e-mail existir, enviaremos instruções de recuperação." };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const endereco = `${enderecoDaAplicacao()}/redefinir-senha?token=${rawToken}`;
    await this.email.enfileirar(recuperacaoDeSenha(user.email, user.name, endereco));

    /*
      O token nunca volta na resposta, em ambiente nenhum.

      Antes ele voltava quando `NODE_ENV !== "production"`, e a imagem de
      produção não definia essa variável: esta rota pública entregava um token
      válido para qualquer e-mail existente. O atalho sumiu junto com a
      condição. Em desenvolvimento o token continua acessível, mas no log do
      servidor, por meio do provedor de registro.
    */
    return { message: "Se o e-mail existir, enviaremos instruções de recuperação." };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new AppException("INVALID_RESET_TOKEN", "Token de recuperação inválido ou expirado.", HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.encerraSessoesDe(stored.userId, "senha redefinida"),
      // Um pedido de troca de e-mail pendente é exatamente o que alguém
      // deixaria para trás depois de invadir a conta: ele esperaria a
      // confirmação e levaria o login junto. Retomar a senha o cancela.
      this.prisma.emailChangeToken.deleteMany({ where: { userId: stored.userId, usedAt: null } }),
    ]);
  }


  /**
   * Troca a senha de quem está logado.
   *
   * A senha atual é exigida mesmo havendo sessão aberta: sem isso, uma aba
   * esquecida num computador compartilhado vira troca de senha, e quem
   * passou por ali fica dono da conta.
   *
   * Todas as outras sessões caem, que é o ponto de trocar a senha quando se
   * desconfia de alguém. Um par novo de tokens é devolvido para quem trocou
   * continuar onde está, em vez de ser expulso pela própria ação.
   */
  async changePassword(
    quem: AuthenticatedUser,
    dto: ChangePasswordDto,
    contexto?: ContextoDoCliente,
  ): Promise<TokenPair> {
    this.recusaSeForVisita(quem);
    const user = await this.prisma.user.findUnique({ where: { id: quem.userId } });
    if (!user || user.deletedAt) {
      throw new AppException("NOT_FOUND", "Usuário não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new AppException("INVALID_PASSWORD", "Senha atual incorreta.", HttpStatus.BAD_REQUEST);
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new AppException("SAME_PASSWORD", "A nova senha precisa ser diferente da atual.", HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: quem.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: quem.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // Todas, inclusive a desta aba: ela ganha uma sessão nova logo abaixo, e
      // começar do zero é mais simples de provar que manter uma exceção.
      this.encerraSessoesDe(quem.userId, "senha trocada"),
      // Mesmo motivo do `resetPassword`: trocar a senha é a ação de quem
      // desconfia, e um pedido de troca de e-mail pendente é o rastro que um
      // invasor deixaria para levar o login depois.
      this.prisma.emailChangeToken.deleteMany({ where: { userId: quem.userId, usedAt: null } }),
    ]);

    // O aviso não é para quem trocou, que já sabe: é para quem NÃO trocou.
    // É assim que a pessoa descobre no mesmo dia que perdeu a conta, em vez
    // de na próxima vez que tentar entrar.
    await this.email.enfileirar(senhaAlterada(user.email, user.name));

    return this.issueTokenPair(user.id, quem.organizationId, quem.role, undefined, { contexto });
  }

  /**
   * Pede a troca do e-mail de acesso.
   *
   * Pede, não troca. O endereço novo só vira o login quando o link mandado
   * para ele é aberto. Antes a troca valia na hora, e um erro de digitação
   * tinha consequência definitiva: o login passava a ser um endereço que não
   * existe, e a recuperação de senha ia para lá também. Confirmar no destino
   * é o que prova que ele é alcançável antes de tudo depender dele.
   *
   * A senha atual continua sendo exigida, porque a confirmação prova que o
   * endereço existe e não que quem pediu é o dono da conta.
   */
  async changeEmail(quem: AuthenticatedUser, dto: ChangeEmailDto): Promise<{ message: string }> {
    this.recusaSeForVisita(quem);
    const user = await this.prisma.user.findUnique({ where: { id: quem.userId } });
    if (!user || user.deletedAt) {
      throw new AppException("NOT_FOUND", "Usuário não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new AppException("INVALID_PASSWORD", "Senha atual incorreta.", HttpStatus.BAD_REQUEST);
    }

    const novoEmail = dto.newEmail.trim().toLowerCase();
    if (novoEmail === user.email) {
      throw new AppException("SAME_EMAIL", "Este já é o seu e-mail.", HttpStatus.BAD_REQUEST);
    }

    // Conferido aqui só para não mandar um e-mail de confirmação que nunca
    // poderia dar certo. A garantia de verdade continua sendo a restrição
    // única no banco, na hora de confirmar: entre pedir e confirmar, outra
    // pessoa pode ter tomado o endereço.
    const ocupado = await this.prisma.user.findUnique({ where: { email: novoEmail } });
    if (ocupado) {
      // Mensagem genérica: dizer "já existe conta com este e-mail"
      // transformaria esta rota num verificador de quem tem conta aqui.
      throw new AppException("EMAIL_UNAVAILABLE", "Não foi possível usar este e-mail.", HttpStatus.CONFLICT);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    await this.prisma.$transaction([
      // Um pedido novo cancela o anterior. Sem isto, dois links ficariam
      // válidos ao mesmo tempo, e o mais antigo poderia ser confirmado depois
      // por quem quer que o tenha recebido.
      this.prisma.emailChangeToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.emailChangeToken.create({
        data: {
          userId: user.id,
          newEmail: novoEmail,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
        },
      }),
    ]);

    const endereco = `${enderecoDaAplicacao()}/confirmar-email?token=${rawToken}`;
    await this.email.enfileirar(confirmacaoDeEmail(novoEmail, user.name, endereco));

    return { message: "Enviamos um link de confirmação para o endereço novo." };
  }

  /**
   * Confirma a troca, aplicando o endereço novo.
   *
   * Sem sessão de propósito: quem confirma pode estar no leitor de e-mail de
   * outro aparelho, onde não há sessão aberta. Quem prova a identidade aqui é
   * o token, e a senha atual já foi exigida no pedido.
   */
  async confirmEmail(token: string): Promise<void> {
    const stored = await this.prisma.emailChangeToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new AppException(
        "INVALID_EMAIL_TOKEN",
        "Link de confirmação inválido ou expirado.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const emailAntigo = stored.user.email;

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: stored.userId }, data: { email: stored.newEmail } }),
        this.prisma.emailChangeToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
        // As outras sessões caem: se a troca foi feita por quem não devia, é
        // aqui que ele perde os acessos que já tinha abertos.
        this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.encerraSessoesDe(stored.userId, "e-mail trocado"),
      ]);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Alguém tomou o endereço entre o pedido e a confirmação.
        throw new AppException("EMAIL_UNAVAILABLE", "Não foi possível usar este e-mail.", HttpStatus.CONFLICT);
      }
      throw error;
    }

    /*
      O aviso vai para o endereço ANTIGO, e sai agora e não no pedido.

      Agora porque é este o instante em que a conta muda de dono do ponto de
      vista do acesso. E para o antigo porque mandar para o novo avisaria
      justamente quem fez a troca, que já sabe: o endereço antigo é o único
      canal que ainda alcança o dono legítimo depois de uma tomada de conta.
    */
    await this.email.enfileirar(emailAlterado(emailAntigo, stored.user.name, stored.newEmail));
  }


  /**
   * Nem senha nem e-mail mudam de dentro de uma visita de suporte.
   *
   * Numa impersonação o token continua sendo do operador da plataforma, então
   * a senha atual que ele conhece é a dele. Sem esta trava, entrar para dar
   * suporte permitiria trocar a credencial do cliente e assumir a conta.
   */
  private recusaSeForVisita(quem: AuthenticatedUser): void {
    if (quem.impersonating) {
      throw new AppException(
        "IMPERSONATION_FORBIDDEN",
        "Não é possível alterar credenciais durante um acesso de suporte.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Contexto da sessão para o shell da aplicação — ver `AuthController.session`. */
  async getSession(user: AuthenticatedUser) {
    const [record, organization] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, name: true, email: true, platformRole: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: user.organizationId, deletedAt: null },
        select: { id: true, name: true, logoUrl: true, brandColor: true },
      }),
    ]);

    if (!record || !organization) {
      throw new AppException("UNAUTHORIZED", "Sessão inválida.", HttpStatus.UNAUTHORIZED);
    }

    return {
      user: record,
      organization,
      role: user.role,
      impersonating: user.impersonating,
    };
  }

  /**
   * A impersonação é propagada por todo caminho que emite tokens, inclusive
   * o refresh: se ela se perdesse na renovação, um operador da plataforma
   * acabaria com uma sessão comum dentro do cliente — sem o aviso na tela e
   * sem rastro de que aquilo era uma impersonação.
   *
   * O prazo vem junto num objeto só (em vez de um booleano solto + uma data
   * opcional) porque impersonar **sem** prazo não é um estado válido: seria
   * exatamente o acesso permanente que o prazo existe para evitar.
   *
   * Público (não privado) porque o módulo de administração precisa emitir o
   * par de tokens da organização em que o operador está entrando.
   */
  /**
   * Emite o par de tokens, dentro de uma sessão.
   *
   * `sessao` diz qual: `{ id }` continua uma que já existe, que é o caso da
   * renovação; `{ contexto }` abre uma nova, com o navegador e o IP de quem
   * entrou. Sem nenhum dos dois abre uma nova sem contexto, que é o caso das
   * poucas chamadas que não têm a requisição em mãos.
   */
  async issueTokenPair(
    userId: string,
    organizationId: string,
    role: JwtPayload["role"],
    impersonation?: { expiresAt: number },
    sessao?: { id: string } | { contexto?: ContextoDoCliente },
  ): Promise<TokenPair> {
    let sessaoId: string;

    if (sessao && "id" in sessao) {
      sessaoId = sessao.id;
      await this.prisma.sessao.update({
        where: { id: sessaoId },
        data: { ultimaAtividadeEm: new Date() },
      });
    } else {
      const contexto = sessao && "contexto" in sessao ? sessao.contexto : undefined;
      const criada = await this.prisma.sessao.create({
        data: {
          userId,
          organizationId,
          impersonando: impersonation !== undefined,
          userAgent: contexto?.userAgent ?? null,
          ip: contexto?.ip ?? null,
        },
        select: { id: true },
      });
      sessaoId = criada.id;
    }

    const claims = {
      sub: userId,
      organizationId,
      role,
      sid: sessaoId,
      ...(impersonation
        ? { impersonating: true as const, impersonationExpiresAt: impersonation.expiresAt }
        : {}),
    };

    const accessToken = await this.jwt.signAsync(
      { ...claims, jti: crypto.randomUUID() },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...claims, jti: crypto.randomUUID() },
      { expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000) },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        sessaoId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Encerra as sessões de um usuário, com o motivo.
   *
   * Devolve a operação em vez de executá-la, para entrar nas transações que já
   * existem. Os cinco lugares que revogam sessão faziam isso só com a
   * renovação, e todos prometiam no comentário que "as outras sessões caem".
   * Nenhum cumpria por inteiro: o token de acesso seguia valendo até quinze
   * minutos. Encerrar a sessão é o que o derruba na próxima requisição.
   */
  encerraSessoesDe(userId: string, motivo: string, exceto?: string) {
    return this.prisma.sessao.updateMany({
      where: { userId, encerradaEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
      data: { encerradaEm: new Date(), motivoDoEncerramento: motivo },
    });
  }
}
