import { Injectable } from "@nestjs/common";
import { MetaApiError } from "./meta-api-error";
import {
  MetaAd,
  MetaAdSet,
  MetaCampaign,
  MetaConversionEventPayload,
  MetaConversionsApiResponse,
  MetaErrorResponse,
  MetaInsight,
  MetaPagedResponse,
} from "./meta-graph-types";

/** O objeto da conta de anúncios, com os campos que este produto lê. */
export interface MetaAccountHealth {
  name?: string;
  currency?: string;
  account_status?: number;
  spend_cap?: string;
  amount_spent?: string;
  balance?: string;
}

const DEFAULT_BASE_URL = "https://graph.facebook.com/v21.0";

export interface InsightsRange {
  since: string; // "YYYY-MM-DD"
  until: string; // "YYYY-MM-DD"
}

/**
 * Thin, typed wrapper over the Graph API endpoints this product actually
 * needs. `baseUrl` is overridable via META_GRAPH_API_BASE_URL specifically
 * so it can be pointed at a local mock server in tests/dev — there are no
 * real Meta credentials in this environment, so the full HTTP contract
 * (pagination, error shapes) is validated against a test double that mimics
 * Meta's documented responses, not against the live API. See
 * docs/META_ADS.md for exactly what real credentials would be needed.
 */
@Injectable()
export class MetaGraphClient {
  private readonly baseUrl = process.env.META_GRAPH_API_BASE_URL ?? DEFAULT_BASE_URL;

  async getCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaign[]> {
    const url = this.buildUrl(`/${adAccountId}/campaigns`, accessToken, { fields: "id,name,status,created_time" });
    return this.fetchAllPages<MetaCampaign>(url);
  }

  async getAdSets(adAccountId: string, accessToken: string): Promise<MetaAdSet[]> {
    const url = this.buildUrl(`/${adAccountId}/adsets`, accessToken, { fields: "id,name,status,campaign_id" });
    return this.fetchAllPages<MetaAdSet>(url);
  }

  async getAds(adAccountId: string, accessToken: string): Promise<MetaAd[]> {
    const url = this.buildUrl(`/${adAccountId}/ads`, accessToken, { fields: "id,name,status,adset_id" });
    return this.fetchAllPages<MetaAd>(url);
  }

  /**
   * Desempenho diário, pedido no nível do anúncio.
   *
   * Era pedido no nível da campanha, e por isso o produto sabia qual criativo
   * trouxe cada lead mas não quanto ele custou. Uma chamada só resolve os dois
   * níveis: o gasto por anúncio vem direto, e o da campanha sai da soma destas
   * mesmas linhas por `campaign_id`.
   *
   * Impressões e cliques não custam chamada extra e separam dois diagnósticos
   * que o gasto sozinho confunde: o anúncio não está sendo visto, ou está
   * sendo visto e ninguém clica.
   */
  async getInsights(adAccountId: string, accessToken: string, range: InsightsRange): Promise<MetaInsight[]> {
    const url = this.buildUrl(`/${adAccountId}/insights`, accessToken, {
      level: "ad",
      fields: "campaign_id,adset_id,ad_id,spend,impressions,clicks,actions",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.since, until: range.until }),
    });
    return this.fetchAllPages<MetaInsight>(url);
  }

  /**
   * Sends one event to the Conversions API (`POST /{pixel_id}/events`) —
   * used for Lead/QualifiedLead/Purchase (Fase 7), never for ads reporting.
   * Same error envelope as the rest of the Graph API, so it reuses the same
   * `MetaApiError` parsing/classification (token expired, rate limited).
   */
  /**
   * A saúde da conta, direto do objeto da conta de anúncios.
   *
   * Uma chamada só, sem paginação, porque é um objeto e não uma coleção.
   *
   * `spend_cap` e `amount_spent` andam em par e precisam ser pedidos juntos:
   * o teto sozinho não diz quanto falta, e o acumulado sozinho não diz contra
   * o quê. `balance` só existe em conta pré-paga e vem ausente nas outras,
   * que é diferente de vir zero.
   */
  async getAccountHealth(adAccountId: string, accessToken: string): Promise<MetaAccountHealth> {
    const url = this.buildUrl(`/${adAccountId}`, accessToken, {
      fields: "name,currency,account_status,spend_cap,amount_spent,balance",
    });
    const response = await fetch(url);
    const body = await response.json();
    this.throwIfError(response, body);
    return body as MetaAccountHealth;
  }

  /**
   * Escreve na conta: muda o status de uma campanha, conjunto ou anúncio.
   *
   * A Graph API usa `POST /{id}` para os três níveis, com o mesmo corpo. O
   * nível não muda a chamada, mas muda o alcance: pausar uma campanha derruba
   * tudo abaixo dela, e é por isso que quem chama precisa dizer o que está
   * fazendo em vez de mandar um id solto.
   *
   * Precisa de `ads_management` no token. Sem essa permissão a Meta devolve
   * código 200 (sem relação com HTTP 200), que `MetaApiError` preserva para a
   * camada acima conseguir dizer *qual* é o problema em vez de "falhou".
   */
  async atualizarStatus(
    externalId: string,
    accessToken: string,
    status: "ACTIVE" | "PAUSED",
  ): Promise<void> {
    await this.escreve(externalId, accessToken, { status });
  }

  /**
   * Muda o orçamento diário de um conjunto de anúncios.
   *
   * Em centavos, que é como a Meta trabalha para BRL: `daily_budget` vai na
   * menor unidade da moeda da conta. Mandar reais aqui multiplicaria o
   * orçamento do cliente por cem, e é literalmente o erro mais caro que este
   * arquivo pode cometer.
   *
   * Só no conjunto, e não na campanha: campanha com orçamento por campanha
   * (CBO) distribui sozinha entre os conjuntos, e escrever nos dois lugares
   * produz um estado que a Meta recusa ou ignora sem avisar.
   */
  async atualizarOrcamentoDiario(
    adSetExternalId: string,
    accessToken: string,
    centavos: number,
  ): Promise<void> {
    await this.escreve(adSetExternalId, accessToken, { daily_budget: String(centavos) });
  }

  private async escreve(
    externalId: string,
    accessToken: string,
    campos: Record<string, string>,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${externalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...campos, access_token: accessToken }),
    });
    const body = await response.json();
    this.throwIfError(response, body);

    /*
      A Meta responde `{"success": true}` e, em alguns objetos, só o id. Um
      corpo sem nenhum dos dois, com HTTP 200, é ambíguo demais para ser
      tratado como sucesso: quem chama vai gravar "aplicado" no histórico.
    */
    const confirmado = body as { success?: boolean; id?: string };
    if (confirmado.success === false) {
      throw new MetaApiError(undefined, undefined, "A Meta recusou a alteração sem explicar o motivo.", 502);
    }
  }

  async sendConversionEvent(
    pixelId: string,
    accessToken: string,
    payload: MetaConversionEventPayload,
  ): Promise<MetaConversionsApiResponse> {
    const response = await fetch(`${this.baseUrl}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [payload], access_token: accessToken }),
    });
    const body = await response.json();
    this.throwIfError(response, body);
    return body as MetaConversionsApiResponse;
  }

  private buildUrl(path: string, accessToken: string, params: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }

  private async fetchAllPages<T>(firstUrl: string): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | undefined = firstUrl;

    while (nextUrl) {
      const response: Response = await fetch(nextUrl);
      const body = await response.json();
      this.throwIfError(response, body);

      const page = body as MetaPagedResponse<T>;
      results.push(...page.data);
      nextUrl = page.paging?.next;
    }

    return results;
  }

  private throwIfError(response: Response, body: unknown): void {
    if (response.ok) return;
    const errorBody = body as MetaErrorResponse;
    throw new MetaApiError(
      errorBody.error?.code,
      errorBody.error?.error_subcode,
      errorBody.error?.message ?? `Meta API request failed with status ${response.status}`,
      response.status,
    );
  }
}
