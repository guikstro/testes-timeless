/**
 * O arquivo que o Google Ads lê na importação de conversões offline.
 *
 * As colunas e a ordem são as do modelo oficial. O conteúdo é montado aqui, e
 * não no servidor, porque o download acontece no navegador; o que é delicado
 * (o horário e a janela de noventa dias) já vem resolvido da API.
 */

export type TipoDeConversao = "QUALIFIED" | "WON";

export interface LinhaDeConversao {
  leadId: string;
  leadNome: string | null;
  gclid: string;
  tipo: TipoDeConversao;
  conversionTime: string;
  ocorridoEm: string;
  valorCentavos: number | null;
  foraDaJanela: boolean;
}

export interface NomesDasAcoes {
  qualificado: string | null;
  venda: string | null;
}

const CABECALHO = [
  "Google Click ID",
  "Conversion Name",
  "Conversion Time",
  "Conversion Value",
  "Conversion Currency",
];

/**
 * Aspas só quando precisa, e aspa dobrada dentro do texto.
 *
 * O nome da ação é digitado pelo cliente e pode ter vírgula. Sem isto, uma
 * vírgula no nome empurraria todas as colunas seguintes uma casa para a
 * direita, e o Google leria o horário como se fosse o valor.
 */
function celula(valor: string): string {
  if (!/[",\n]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

/** Centavos viram o decimal com ponto que o Google espera. Null vira vazio. */
function valor(centavos: number | null): string {
  return centavos === null ? "" : (centavos / 100).toFixed(2);
}

/**
 * Linhas fora da janela de noventa dias ficam de fora do arquivo.
 *
 * O Google as recusaria de qualquer jeito, e mandá-las junto só faria o
 * relatório de importação dele acusar erros que já sabíamos.
 */
export function montaCsv(
  linhas: LinhaDeConversao[],
  acoes: NomesDasAcoes,
  moeda: string,
): string {
  const nome = (tipo: TipoDeConversao) => (tipo === "QUALIFIED" ? acoes.qualificado : acoes.venda);

  const corpo = linhas
    .filter((linha) => !linha.foraDaJanela && nome(linha.tipo))
    .map((linha) =>
      [
        celula(linha.gclid),
        celula(nome(linha.tipo) as string),
        celula(linha.conversionTime),
        valor(linha.valorCentavos),
        celula(moeda),
      ].join(","),
    );

  // Quebra com \r\n: é o que planilha e o importador do Google esperam de um
  // CSV, e evita a última linha ser lida como parte da anterior no Windows.
  return [CABECALHO.join(","), ...corpo].join("\r\n") + "\r\n";
}

/** Quantas linhas realmente entram no arquivo, para a tela não prometer mais do que envia. */
export function contaExportaveis(linhas: LinhaDeConversao[], acoes: NomesDasAcoes): number {
  return linhas.filter(
    (linha) => !linha.foraDaJanela && (linha.tipo === "QUALIFIED" ? acoes.qualificado : acoes.venda),
  ).length;
}
