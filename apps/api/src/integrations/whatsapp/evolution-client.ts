import { Injectable } from "@nestjs/common";
import { EvolutionApiError } from "./evolution-api-error";

const DEFAULT_BASE_URL = "http://evolution:8080";

/**
 * Sem isso, uma instância sem sessão ativa faz a Evolution segurar a
 * requisição indefinidamente — observado na validação da Fase 8, onde o job
 * de envio ficou preso em "active" para sempre, ocupando um slot do worker
 * que nunca seria liberado nem por retry nem por falha.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/** Estado da instância como a Evolution reporta em `/instance/connectionState`. */
export type EvolutionConnectionState = "open" | "connecting" | "close";

export interface EvolutionQrCode {
  /** Data URI (`data:image/png;base64,...`) pronto para um `<img src>`. */
  base64: string | null;
  /** Código textual, para quem preferir renderizar o QR por conta própria. */
  code: string | null;
}

/**
 * O que a Evolution tem registrado como webhook de uma instância.
 *
 * Existe para poder *conferir* o registro, e não só escrevê-lo: uma instância
 * criada por uma versão antiga do produto carrega a configuração daquela
 * versão para sempre, porque nada nunca volta para corrigi-la.
 */
export interface EvolutionWebhookRegistrado {
  url: string;
  habilitado: boolean;
  /** Mídia embutida no payload. Ver `CONFIGURACAO_DO_WEBHOOK`. */
  base64: boolean;
  porEvento: boolean;
  eventos: string[];
}

export interface EvolutionSendResult {
  /** Id da mensagem no WhatsApp (`3EB0...`), usado como `Message.externalId`. */
  externalId: string;
}

/**
 * Wrapper fino sobre as rotas da Evolution API que este produto realmente
 * usa. `baseUrl` é sobrescrevível por `EVOLUTION_API_URL` justamente para
 * apontar a um servidor de teste local nos e2e, sem mockar métodos — mesma
 * técnica usada no `MetaGraphClient` (Fase 6).
 */
/**
 * A configuração que toda instância deste produto precisa ter — uma só, num
 * lugar só.
 *
 * Estava duplicada dentro de `createInstance` e em nenhum outro lugar, que é
 * o mesmo que dizer que valia apenas para instâncias novas. As antigas ficavam
 * com o que tinham no dia em que nasceram.
 *
 * `base64: false` é a parte que custa mensagem quando está errada: o parser lê
 * texto, chave, timestamp e o contexto do anúncio, nunca a mídia. Pedir base64
 * embute a imagem/áudio/vídeo inteiros em todo payload, e a inflação de 4/3 da
 * codificação leva um vídeo comum a estourar o limite do body parser. Aí a
 * requisição morre antes de qualquer código nosso rodar, e some a mensagem
 * inteira, não só o anexo: remetente, texto e horário juntos.
 */
export const CONFIGURACAO_DO_WEBHOOK = {
  byEvents: false,
  base64: false,
  // Só o que o pipeline consome: mensagem nova e mudança de conexão.
  // Presença/typing/contatos gerariam tráfego constante sem uso.
  events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
} as const;

@Injectable()
export class EvolutionClient {
  private readonly baseUrl = process.env.EVOLUTION_API_URL ?? DEFAULT_BASE_URL;
  private readonly apiKey = process.env.EVOLUTION_API_KEY ?? "";

  /**
   * Cria a instância já apontando o webhook para a nossa API. Registrar o
   * webhook aqui (e não numa chamada separada depois) evita uma janela em
   * que a instância existe mas mensagens recebidas se perderiam.
   */
  async createInstance(instanceName: string, webhookUrl: string): Promise<void> {
    await this.request("POST", "/instance/create", {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: { url: webhookUrl, ...CONFIGURACAO_DO_WEBHOOK },
    });
  }

  /**
   * Lê o webhook registrado para a instância, ou `null` se não houver nenhum.
   *
   * A Evolution responde `{}` quando a instância existe mas nunca teve
   * webhook, então "sem registro" e "instância sem webhook" chegam iguais aqui
   * e recebem a mesma resposta: `null`, que quem chama trata como "precisa
   * registrar".
   */
  async lerWebhook(instanceName: string): Promise<EvolutionWebhookRegistrado | null> {
    const body = await this.request<{
      url?: string;
      enabled?: boolean;
      webhookBase64?: boolean;
      webhookByEvents?: boolean;
      events?: string[];
    }>("GET", `/webhook/find/${encodeURIComponent(instanceName)}`);

    if (!body?.url) return null;
    return {
      url: body.url,
      habilitado: body.enabled !== false,
      base64: body.webhookBase64 === true,
      porEvento: body.webhookByEvents === true,
      eventos: body.events ?? [],
    };
  }

  /**
   * Regrava o webhook da instância com a configuração atual do produto.
   *
   * Idempotente do lado da Evolution: a rota substitui o registro inteiro, não
   * mescla, então chamar duas vezes deixa o mesmo estado.
   */
  async defineWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.request("POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
      webhook: { enabled: true, url: webhookUrl, ...CONFIGURACAO_DO_WEBHOOK },
    });
  }

  /**
   * Busca o QR Code atual. A Evolution rotaciona o código a cada ~30s, então
   * a UI precisa repetir esta chamada enquanto o status for PENDING_QR.
   */
  async getQrCode(instanceName: string): Promise<EvolutionQrCode> {
    const body = await this.request<{ base64?: string; code?: string }>(
      "GET",
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
    return { base64: body.base64 ?? null, code: body.code ?? null };
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    const body = await this.request<{ instance?: { state?: string } }>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
    const state = body.instance?.state;
    return state === "open" || state === "connecting" ? state : "close";
  }

  /** Número conectado, em dígitos com DDI (ex.: "5585999999999"). Null enquanto o QR não foi lido. */
  async getConnectedNumber(instanceName: string): Promise<string | null> {
    const body = await this.request<Array<{ name?: string; ownerJid?: string }>>(
      "GET",
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
    );
    const ownerJid = Array.isArray(body) ? body[0]?.ownerJid : undefined;
    // ownerJid vem como "5585999999999@s.whatsapp.net".
    return ownerJid ? ownerJid.split("@")[0] : null;
  }

  async sendText(instanceName: string, toPhoneDigits: string, text: string): Promise<EvolutionSendResult> {
    const body = await this.request<{ key?: { id?: string } }>(
      "POST",
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      { number: toPhoneDigits, text },
    );

    const externalId = body.key?.id;
    if (!externalId) {
      // Sem id não há como deduplicar o eco desta mensagem quando ela voltar
      // pelo webhook — tratar como falha é mais honesto que gravar um envio
      // que não conseguimos rastrear.
      throw new EvolutionApiError("A Evolution aceitou a mensagem mas não devolveu um id.", 502);
    }
    return { externalId };
  }

  /** Desconecta o aparelho, mas mantém a instância — permite reconectar lendo um novo QR. */
  async logout(instanceName: string): Promise<void> {
    await this.request("DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`);
  }

  /** Remove a instância inteira do lado da Evolution. */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.request("DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          apikey: this.apiKey,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Um abort/erro de rede vira um EvolutionApiError como qualquer outra
      // falha, para quem chama tratar um só tipo — e 504 marca "sem resposta
      // a tempo", que o retry do BullMQ pode resolver.
      const reason = error instanceof Error && error.name === "TimeoutError"
        ? `A Evolution API não respondeu em ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Falha de rede ao falar com a Evolution API: ${(error as Error).message}`;
      throw new EvolutionApiError(reason, 504);
    }

    const raw = await response.text();
    const parsed: unknown = raw ? safeJsonParse(raw) : null;

    if (!response.ok) {
      throw new EvolutionApiError(extractErrorMessage(parsed, response.status), response.status);
    }
    return (parsed ?? {}) as T;
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // A Evolution ocasionalmente responde texto puro (ex.: erros de proxy).
    return { message: raw };
  }
}

/**
 * A Evolution não tem um envelope de erro único: dependendo da rota e da
 * versão, a mensagem vem em `message` (string ou array) ou em `error`. Este
 * helper cobre as variações em vez de assumir uma só e quebrar em produção
 * com "undefined" na tela.
 */
function extractErrorMessage(parsed: unknown, httpStatus: number): string {
  if (parsed && typeof parsed === "object") {
    const candidate = parsed as { message?: unknown; error?: unknown; response?: { message?: unknown } };
    const message = candidate.response?.message ?? candidate.message ?? candidate.error;

    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.length > 0) return message.map(String).join("; ");
  }
  return `A Evolution API respondeu com status ${httpStatus}.`;
}
