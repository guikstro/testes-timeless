/**
 * Leitura de relatório de gasto exportado de uma plataforma de anúncios.
 *
 * Cada plataforma exporta de um jeito, e nenhuma pergunta o que a gente
 * precisa. Em vez de fixar um formato e recusar o resto, este módulo descobre
 * o que dá para descobrir e devolve as colunas para quem importa escolher.
 */

export interface CsvLido {
  cabecalho: string[];
  linhas: string[][];
  /** Índices que parecem data e valor, para a tela já vir preenchida. */
  sugestaoData: number | null;
  sugestaoValor: number | null;
}

export interface LinhaDeGasto {
  date: string;
  spendCents: number;
}

/**
 * Separa uma linha respeitando aspas.
 *
 * Um `split` simples quebra em qualquer vírgula, e nomes de campanha com
 * vírgula ("Busca | Marca, Institucional") desalinhariam a linha inteira,
 * jogando o gasto para a coluna errada sem erro nenhum aparente.
 */
function separaLinha(linha: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];

    if (c === '"') {
      // Duas aspas seguidas dentro de um campo representam uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
      continue;
    }

    if (c === delimitador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = "";
      continue;
    }

    atual += c;
  }

  campos.push(atual.trim());
  return campos;
}

/** O delimitador sai da linha de cabeçalho: é o que aparece mais vezes nela. */
function detectaDelimitador(cabecalho: string): string {
  const candidatos = [",", ";", "\t"];
  return candidatos.reduce((melhor, atual) =>
    cabecalho.split(atual).length > cabecalho.split(melhor).length ? atual : melhor,
  );
}

const PALAVRAS_DATA = ["data", "date", "dia", "day"];
const PALAVRAS_VALOR = ["custo", "cost", "gasto", "spend", "investimento", "valor", "amount"];

function procuraColuna(cabecalho: string[], palavras: string[]): number | null {
  const indice = cabecalho.findIndex((titulo) =>
    palavras.some((palavra) => titulo.toLowerCase().includes(palavra)),
  );
  return indice >= 0 ? indice : null;
}

export function leCsv(conteudo: string): CsvLido {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);

  if (linhas.length === 0) {
    return { cabecalho: [], linhas: [], sugestaoData: null, sugestaoValor: null };
  }

  /*
    O Google Ads põe duas linhas de título antes do cabeçalho de verdade
    ("Relatório de campanha", intervalo de datas). O cabeçalho real é a
    primeira linha com mais de uma coluna, então pulamos o preâmbulo em vez de
    exigir que a pessoa edite o arquivo antes de subir.
  */
  const delimitador = detectaDelimitador(linhas[0]);
  const inicio = linhas.findIndex((linha) => separaLinha(linha, delimitador).length > 1);
  if (inicio === -1) {
    return { cabecalho: [], linhas: [], sugestaoData: null, sugestaoValor: null };
  }

  const cabecalho = separaLinha(linhas[inicio], delimitador);
  const corpo = linhas
    .slice(inicio + 1)
    .map((linha) => separaLinha(linha, delimitador))
    // Rodapé de totais tem menos colunas que o cabeçalho e não é um dia.
    .filter((campos) => campos.length === cabecalho.length);

  return {
    cabecalho,
    linhas: corpo,
    sugestaoData: procuraColuna(cabecalho, PALAVRAS_DATA),
    sugestaoValor: procuraColuna(cabecalho, PALAVRAS_VALOR),
  };
}

/**
 * Converte texto de dinheiro em centavos.
 *
 * Aceita as duas convenções porque o mesmo relatório muda de formato conforme
 * o idioma da conta: "1.234,56" no Brasil e "1,234.56" em inglês. Decidir pelo
 * último separador é o que distingue os dois sem precisar perguntar.
 */
export function paraCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "").trim();
  if (!limpo || limpo === "-") return null;

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");

  let normalizado: string;
  if (ultimaVirgula > ultimoPonto) {
    // Vírgula é o decimal: pontos são separadores de milhar.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto > ultimaVirgula) {
    normalizado = limpo.replace(/,/g, "");
  } else {
    normalizado = limpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

/**
 * Normaliza data para AAAA-MM-DD.
 *
 * Formato brasileiro e ISO são aceitos. Ambíguos como "03/04/2026" são lidos
 * como dia/mês, que é a convenção de quem vai usar isto; um relatório em
 * inglês com data ambígua entraria trocado, e por isso a tela mostra a prévia
 * antes de importar.
 */
export function paraDataIso(texto: string): string | null {
  const limpo = texto.trim();

  const iso = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = limpo.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    if (Number(mes) > 12 || Number(dia) > 31) return null;
    return `${br[3]}-${mes}-${dia}`;
  }

  return null;
}

export interface ResultadoExtracao {
  linhas: LinhaDeGasto[];
  /** Linhas que não deram para ler, com o motivo, para a tela poder mostrar. */
  ignoradas: { linha: number; motivo: string }[];
}

export function extraiGastos(csv: CsvLido, colunaData: number, colunaValor: number): ResultadoExtracao {
  const porData = new Map<string, number>();
  const ignoradas: { linha: number; motivo: string }[] = [];

  csv.linhas.forEach((campos, indice) => {
    const data = paraDataIso(campos[colunaData] ?? "");
    if (!data) {
      ignoradas.push({ linha: indice + 1, motivo: `data não reconhecida: "${campos[colunaData] ?? ""}"` });
      return;
    }

    const centavos = paraCentavos(campos[colunaValor] ?? "");
    if (centavos === null) {
      ignoradas.push({ linha: indice + 1, motivo: `valor não reconhecido: "${campos[colunaValor] ?? ""}"` });
      return;
    }

    // Relatórios detalhados trazem várias linhas do mesmo dia, uma por
    // anúncio ou palavra-chave. Somar é o certo aqui, ao contrário do
    // lançamento manual, onde repetir o dia é correção.
    porData.set(data, (porData.get(data) ?? 0) + centavos);
  });

  return {
    linhas: [...porData.entries()]
      .map(([date, spendCents]) => ({ date, spendCents }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    ignoradas,
  };
}
