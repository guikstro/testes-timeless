import { Injectable } from "@nestjs/common";
import { noGoogle } from "./endereco-do-google";
import { erroDaResposta } from "./erro-do-google";
import { RespostaDasMetricas } from "./metricas-do-perfil";

const CONTAS = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFORMACOES = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DESEMPENHO = "https://businessprofileperformance.googleapis.com/v1";

/** Teto de páginas: uma paginação que nunca acaba não pode prender a leitura. */
const MAXIMO_DE_PAGINAS = 50;

export interface ContaDoGoogle {
  /** "accounts/123" */
  name: string;
  accountName?: string;
  /** PERSONAL, LOCATION_GROUP, USER_GROUP, ORGANIZATION. */
  type?: string;
}

export interface LocalDoGoogle {
  /** "locations/456" */
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    sublocality?: string;
    locality?: string;
    administrativeArea?: string;
  };
}

/**
 * As três APIs do Perfil da Empresa que este produto usa: contas, locais e
 * desempenho. Todas pedem o escopo `business.manage`, e todas ficam com cota
 * zero até o Google aprovar o projeto.
 */
@Injectable()
export class PerfilDaEmpresaClient {
  /**
   * As contas que a conta da equipe enxerga, e as de dentro de cada
   * organização ou grupo de usuários: numa agência, os perfis dos clientes
   * ficam em grupos de locais, e não na conta pessoal de quem conectou.
   */
  async contas(token: string): Promise<ContaDoGoogle[]> {
    const primeiras = await this.paginas<ContaDoGoogle>(token, CONTAS, {}, "accounts", "20");
    const todas = new Map(primeiras.map((conta) => [conta.name, conta]));
    for (const conta of primeiras) {
      if (conta.type !== "ORGANIZATION" && conta.type !== "USER_GROUP") continue;
      const filhas = await this.paginas<ContaDoGoogle>(token, CONTAS, { parentAccount: conta.name }, "accounts", "20");
      for (const filha of filhas) todas.set(filha.name, filha);
    }
    return [...todas.values()];
  }

  async locais(token: string, conta: string): Promise<LocalDoGoogle[]> {
    return this.paginas<LocalDoGoogle>(
      token,
      `${INFORMACOES}/${conta}/locations`,
      { readMask: "name,title,storefrontAddress" },
      "locations",
      "100",
    );
  }

  /**
   * As métricas diárias de um local, de `de` a `ate` (inclusive), numa chamada.
   * Os nomes dos parâmetros são os da documentação: `dailyMetrics` repetido e
   * `dailyRange.start_date.year`.
   */
  async metricasDiarias(token: string, localId: string, metricas: readonly string[], de: string, ate: string): Promise<RespostaDasMetricas> {
    const busca = new URLSearchParams();
    for (const metrica of metricas) busca.append("dailyMetrics", metrica);
    const [anoDe, mesDe, diaDe] = de.split("-").map(Number);
    const [anoAte, mesAte, diaAte] = ate.split("-").map(Number);
    busca.set("dailyRange.start_date.year", String(anoDe));
    busca.set("dailyRange.start_date.month", String(mesDe));
    busca.set("dailyRange.start_date.day", String(diaDe));
    busca.set("dailyRange.end_date.year", String(anoAte));
    busca.set("dailyRange.end_date.month", String(mesAte));
    busca.set("dailyRange.end_date.day", String(diaAte));
    return this.pede<RespostaDasMetricas>(token, `${DESEMPENHO}/${localId}:fetchMultiDailyMetricsTimeSeries?${busca.toString()}`);
  }

  private async paginas<T>(
    token: string,
    endereco: string,
    filtros: Record<string, string>,
    campo: string,
    tamanho: string,
  ): Promise<T[]> {
    const itens: T[] = [];
    let pagina: string | undefined;
    for (let volta = 0; volta < MAXIMO_DE_PAGINAS; volta++) {
      const busca = new URLSearchParams({ ...filtros, pageSize: tamanho });
      if (pagina) busca.set("pageToken", pagina);
      const corpo = await this.pede<Record<string, unknown>>(token, `${endereco}?${busca.toString()}`);
      itens.push(...((corpo[campo] as T[] | undefined) ?? []));
      pagina = typeof corpo.nextPageToken === "string" && corpo.nextPageToken ? corpo.nextPageToken : undefined;
      if (!pagina) break;
    }
    return itens;
  }

  private async pede<T>(token: string, endereco: string): Promise<T> {
    const resposta = await fetch(noGoogle(endereco), { headers: { Authorization: `Bearer ${token}` } });
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) throw erroDaResposta(resposta.status, corpo);
    return (corpo ?? {}) as T;
  }
}

/** "Rua X, 10, Centro, Cidade - UF": o bastante para a equipe reconhecer o local. */
export function enderecoLegivel(local: LocalDoGoogle): string | null {
  const endereco = local.storefrontAddress;
  if (!endereco) return null;
  const partes = [...(endereco.addressLines ?? []), endereco.sublocality, endereco.locality].filter(Boolean);
  const texto = partes.join(", ") + (endereco.administrativeArea ? ` - ${endereco.administrativeArea}` : "");
  return texto.trim() ? texto.slice(0, 300) : null;
}
