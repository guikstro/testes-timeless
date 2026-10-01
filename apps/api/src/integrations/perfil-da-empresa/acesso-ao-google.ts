import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { credenciaisDoGoogle, enderecoDeRetorno, noGoogle } from "./endereco-do-google";
import { ErroDoGoogle, erroDaResposta, explicaErroDoGoogle } from "./erro-do-google";

/**
 * O que a equipe autoriza: os perfis (`business.manage`, o único escopo da
 * API do Perfil da Empresa) e o e-mail, para a tela dizer qual conta está
 * ligada.
 */
export const ESCOPOS = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];

const AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOGACAO = "https://oauth2.googleapis.com/revoke";

/** Renova um pouco antes do fim: um token que vence no meio da leitura derruba a leitura. */
const MARGEM_MS = 5 * 60_000;

interface RespostaDoToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

export interface Autorizacao {
  refreshToken: string;
  escopos: string;
  email: string | null;
}

/**
 * O acesso da conta Google da equipe.
 *
 * Guarda só o token de renovação, cifrado. O de acesso dura uma hora e fica
 * na memória do processo: cada leitura de cliente pedindo um novo gastaria
 * uma ida ao Google à toa.
 */
@Injectable()
export class AcessoAoGoogle {
  private emMemoria: { token: string; venceEm: number; daConta: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  configurado(): boolean {
    return credenciaisDoGoogle() !== null;
  }

  /**
   * O endereço da tela de consentimento.
   *
   * `access_type=offline` e `prompt=consent` juntos: sem eles o Google só
   * devolve o token de renovação na primeira autorização, e reconectar a
   * mesma conta voltaria sem ele.
   */
  urlDeConsentimento(estado: string): string {
    const credenciais = this.exigeCredenciais();
    const busca = new URLSearchParams({
      client_id: credenciais.clientId,
      redirect_uri: enderecoDeRetorno(),
      response_type: "code",
      scope: ESCOPOS.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: estado,
    });
    return `${noGoogle(AUTORIZACAO)}?${busca.toString()}`;
  }

  /** Troca o código da volta pelo token de renovação. */
  async trocaCodigo(codigo: string): Promise<Autorizacao> {
    const credenciais = this.exigeCredenciais();
    const resposta = await this.postaFormulario(TOKEN, {
      code: codigo,
      client_id: credenciais.clientId,
      client_secret: credenciais.clientSecret,
      redirect_uri: enderecoDeRetorno(),
      grant_type: "authorization_code",
    });
    if (!resposta.refresh_token) {
      throw new ErroDoGoogle(
        "O Google não devolveu o acesso permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.",
        400,
        "sem_refresh_token",
      );
    }
    const escopos = resposta.scope ?? "";
    if (!escopos.includes("business.manage")) {
      throw new ErroDoGoogle(
        "A autorização voltou sem o acesso aos perfis. Na tela do Google, deixe marcada a permissão de gerenciar o Perfil da Empresa.",
        400,
        "sem_escopo",
      );
    }
    return { refreshToken: resposta.refresh_token, escopos, email: emailDoIdToken(resposta.id_token) };
  }

  /**
   * Um token de acesso válido. Se o Google recusar renovar, a recusa fica
   * gravada na conta: a tela da equipe passa a pedir para conectar de novo.
   */
  async token(): Promise<string> {
    const conta = await this.prisma.contaGoogleDaEquipe.findUnique({ where: { id: "equipe" } });
    if (!conta) throw new ErroDoGoogle("Nenhuma conta Google da equipe conectada.", 401, "sem_conta");

    if (this.emMemoria && this.emMemoria.daConta === conta.refreshTokenEncrypted && this.emMemoria.venceEm > Date.now()) {
      return this.emMemoria.token;
    }

    const credenciais = this.exigeCredenciais();
    try {
      const resposta = await this.postaFormulario(TOKEN, {
        refresh_token: this.encryption.decrypt(conta.refreshTokenEncrypted),
        client_id: credenciais.clientId,
        client_secret: credenciais.clientSecret,
        grant_type: "refresh_token",
      });
      this.emMemoria = {
        token: resposta.access_token,
        venceEm: Date.now() + resposta.expires_in * 1000 - MARGEM_MS,
        daConta: conta.refreshTokenEncrypted,
      };
      if (conta.erro) await this.prisma.contaGoogleDaEquipe.update({ where: { id: "equipe" }, data: { erro: null } });
      return resposta.access_token;
    } catch (erro) {
      if (erro instanceof ErroDoGoogle && erro.acessoPerdido) {
        await this.prisma.contaGoogleDaEquipe.update({ where: { id: "equipe" }, data: { erro: explicaErroDoGoogle(erro) } });
      }
      throw erro;
    }
  }

  /** Avisa o Google que o acesso acabou. Melhor esforço: desligar aqui não depende dele. */
  async revoga(refreshTokenCifrado: string): Promise<void> {
    this.emMemoria = null;
    try {
      await fetch(noGoogle(REVOGACAO), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: this.encryption.decrypt(refreshTokenCifrado) }).toString(),
      });
    } catch {
      // O token continua guardado só no Google, e a pessoa pode revogar em myaccount.google.com/permissions.
    }
  }

  esqueceAcesso(): void {
    this.emMemoria = null;
  }

  private exigeCredenciais() {
    const credenciais = credenciaisDoGoogle();
    if (!credenciais) {
      throw new ErroDoGoogle(
        "Falta configurar GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET na API.",
        503,
        "sem_credenciais",
      );
    }
    return credenciais;
  }

  private async postaFormulario(endereco: string, campos: Record<string, string>): Promise<RespostaDoToken> {
    const resposta = await fetch(noGoogle(endereco), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(campos).toString(),
    });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) throw erroDaResposta(resposta.status, corpo);
    return corpo as RespostaDoToken;
  }
}

/**
 * O e-mail de quem autorizou, de dentro do id_token.
 *
 * Sem conferir a assinatura: o token veio direto do Google, pela troca feita
 * aqui por HTTPS, e não por quem está do outro lado do navegador. É o caso
 * em que a especificação do OpenID dispensa a conferência.
 */
export function emailDoIdToken(idToken: string | undefined): string | null {
  const meio = idToken?.split(".")[1];
  if (!meio) return null;
  try {
    const conteudo = JSON.parse(Buffer.from(meio, "base64url").toString("utf8")) as { email?: unknown };
    return typeof conteudo.email === "string" ? conteudo.email.slice(0, 320) : null;
  } catch {
    return null;
  }
}
