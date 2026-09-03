/**
 * As linhas que voltam para o Google Ads.
 *
 * Existe como função pura porque é aqui que mora o que erra em silêncio: o
 * formato do horário, a janela de noventa dias e a escolha de qual instante
 * representa cada conversão. Um erro em qualquer um deles não derruba nada,
 * só faz o Google descartar a linha sem avisar ninguém.
 */

import { fusoSeguro } from "../../common/tempo";

export type TipoDeConversao = "QUALIFIED" | "WON";

export interface LeadParaExportar {
  id: string;
  name: string | null;
  qualifiedAt: Date | null;
  wonAt: Date | null;
  sale: { amountCents: number | null; detectedAt: Date } | null;
  gclid: string;
  clickedAt: Date;
}

export interface LinhaDeConversao {
  leadId: string;
  leadNome: string | null;
  gclid: string;
  tipo: TipoDeConversao;
  /** Já no formato que o Google aceita, com o deslocamento explícito. */
  conversionTime: string;
  ocorridoEm: string;
  valorCentavos: number | null;
  /**
   * O Google recusa conversão cujo clique tenha mais de noventa dias. A linha
   * continua na lista, marcada: sumir com ela esconderia por que o número
   * exportado é menor que o número de vendas do período.
   */
  foraDaJanela: boolean;
}

/** Limite do Google para importação de conversão offline, contado desde o clique. */
export const DIAS_DESDE_O_CLIQUE = 90;

/**
 * `2026-09-01 14:32:10-03:00`.
 *
 * O deslocamento vai escrito em cada linha em vez de declarado uma vez no
 * cabeçalho do arquivo: assim não depende de o Google interpretar o fuso do
 * jeito que esperamos, e o arquivo continua correto se for aberto e salvo de
 * novo numa planilha.
 */
export function formataHorario(instante: Date, fusoPedido: string): string {
  // Mesma proteção do resto do sistema: um fuso que o `Intl` não reconhece
  // lança, e aqui isso quebraria a exportação inteira por causa de um campo
  // de configuração.
  const fuso = fusoSeguro(fusoPedido);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const pega = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "00";
  const hora = pega("hour") === "24" ? "00" : pega("hour");
  const relogio = `${pega("year")}-${pega("month")}-${pega("day")} ${hora}:${pega("minute")}:${pega("second")}`;

  return `${relogio}${deslocamento(instante, fuso)}`;
}

/** O deslocamento do fuso naquele instante, como `-03:00`. */
function deslocamento(instante: Date, fusoPedido: string): string {
  const fuso = fusoSeguro(fusoPedido);
  const nomeado = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((parte) => parte.type === "timeZoneName")?.value;

  // "GMT-03:00" vira "-03:00"; "GMT" (Londres no inverno) vira "+00:00".
  if (!nomeado) return "+00:00";
  const limpo = nomeado.replace("GMT", "");
  return limpo === "" ? "+00:00" : limpo;
}

export function montaLinhas(leads: LeadParaExportar[], de: Date, ate: Date, fuso: string): LinhaDeConversao[] {
  const linhas: LinhaDeConversao[] = [];

  const dentroDaJanela = (quando: Date) => quando >= de && quando <= ate;
  const idadeEmDias = (conversao: Date, clique: Date) =>
    (conversao.getTime() - clique.getTime()) / 86_400_000;

  for (const lead of leads) {
    const comum = { leadId: lead.id, leadNome: lead.name, gclid: lead.gclid };

    if (lead.qualifiedAt && dentroDaJanela(lead.qualifiedAt)) {
      linhas.push({
        ...comum,
        tipo: "QUALIFIED",
        conversionTime: formataHorario(lead.qualifiedAt, fuso),
        ocorridoEm: lead.qualifiedAt.toISOString(),
        // Sem valor: qualificar não é receita, e mandar um número inventado
        // aqui ensinaria o Google a otimizar por uma receita que não existe.
        valorCentavos: null,
        foraDaJanela: idadeEmDias(lead.qualifiedAt, lead.clickedAt) > DIAS_DESDE_O_CLIQUE,
      });
    }

    // A venda usa o instante em que foi detectada, e não `wonAt`, quando os
    // dois existem: é o carimbo que a venda de fato tem.
    const vendaEm = lead.sale?.detectedAt ?? lead.wonAt;
    if (vendaEm && dentroDaJanela(vendaEm)) {
      linhas.push({
        ...comum,
        tipo: "WON",
        conversionTime: formataHorario(vendaEm, fuso),
        ocorridoEm: vendaEm.toISOString(),
        valorCentavos: lead.sale?.amountCents ?? null,
        foraDaJanela: idadeEmDias(vendaEm, lead.clickedAt) > DIAS_DESDE_O_CLIQUE,
      });
    }
  }

  // Mais recentes primeiro: é a ordem em que se confere se o que aconteceu
  // ontem entrou no arquivo.
  return linhas.sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm));
}
