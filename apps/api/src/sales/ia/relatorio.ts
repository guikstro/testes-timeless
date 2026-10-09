import type { Humano } from "./gabarito";

export interface AnaliseDeUmModelo {
  situacao: string | null;
  /** A IA acha que houve venda (fechada ou prometida). Null quando deu erro. */
  vendaIA: boolean | null;
  confianca: number | null;
  valorEmCentavos: number | null;
  evidencias: string[];
  citacoesInvalidas: number;
  motivoDaPerda: string | null;
  qualidadeDoLead: string | null;
  motivo: string | null;
  erro?: string;
  tokensEntrada: number;
  tokensSaida: number;
  ms: number;
  custo: number;
}

export interface LinhaDoTeste {
  /** O id do lead, que abre a ficha no sistema. Não é dado pessoal. */
  id: string;
  organizacao: string;
  mensagens: number;
  omitidas: number;
  midias: number;
  humano: Humano;
  sistema: "VENDA" | "SEM_VENDA";
  /** A conversa como foi enviada, já sem nome, telefone e e-mail. */
  transcricao: string;
  porModelo: Record<string, AnaliseDeUmModelo>;
}

export type Verdade = "VENDA" | "SEM_VENDA";

/** A resposta de referência: o que uma pessoa decidiu e, sem isso, o que o sistema de hoje acha. */
export const referencia = (linha: LinhaDoTeste): { valor: Verdade; origem: "pessoa" | "sistema" } =>
  linha.humano !== null ? { valor: linha.humano, origem: "pessoa" } : { valor: linha.sistema, origem: "sistema" };

export interface ResumoDoModelo {
  modelo: string;
  analisadas: number;
  erros: number;
  tokensEntradaMedio: number;
  tokensSaidaMedio: number;
  custoTotal: number;
  custoPorMil: number;
  msMedio: number;
  /** Conversas em que a IA citou um trecho que não existe. */
  comCitacaoInventada: number;
  vendasIA: number;
  contraPessoas: { vendasConfirmadas: number; iaEncontrou: number; semVendaDecidida: number; iaDisseVenda: number };
  contraSistema: { regraSemConfirmacao: number; iaConcorda: number; semVendaNoSistema: number; iaVeVendaPerdida: number };
}

const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0);

export function resumoDoModelo(linhas: LinhaDoTeste[], modelo: string): ResumoDoModelo {
  const feitas = linhas.map((l) => ({ linha: l, a: l.porModelo[modelo] })).filter((x) => x.a);
  const boas = feitas.filter((x) => x.a.vendaIA !== null);
  const custoTotal = feitas.reduce((s, x) => s + x.a.custo, 0);

  const pessoasVenda = boas.filter((x) => x.linha.humano === "VENDA");
  const pessoasSem = boas.filter((x) => x.linha.humano === "SEM_VENDA");
  const regraSemConfirmacao = boas.filter((x) => x.linha.humano === null && x.linha.sistema === "VENDA");
  const semVendaNoSistema = boas.filter((x) => x.linha.humano === null && x.linha.sistema === "SEM_VENDA");

  return {
    modelo,
    analisadas: feitas.length,
    erros: feitas.length - boas.length,
    tokensEntradaMedio: Math.round(media(boas.map((x) => x.a.tokensEntrada))),
    tokensSaidaMedio: Math.round(media(boas.map((x) => x.a.tokensSaida))),
    custoTotal,
    custoPorMil: boas.length ? (custoTotal / feitas.length) * 1000 : 0,
    msMedio: Math.round(media(boas.map((x) => x.a.ms))),
    comCitacaoInventada: boas.filter((x) => x.a.citacoesInvalidas > 0).length,
    vendasIA: boas.filter((x) => x.a.vendaIA).length,
    contraPessoas: {
      vendasConfirmadas: pessoasVenda.length,
      iaEncontrou: pessoasVenda.filter((x) => x.a.vendaIA).length,
      semVendaDecidida: pessoasSem.length,
      iaDisseVenda: pessoasSem.filter((x) => x.a.vendaIA).length,
    },
    contraSistema: {
      regraSemConfirmacao: regraSemConfirmacao.length,
      iaConcorda: regraSemConfirmacao.filter((x) => x.a.vendaIA).length,
      semVendaNoSistema: semVendaNoSistema.length,
      iaVeVendaPerdida: semVendaNoSistema.filter((x) => x.a.vendaIA).length,
    },
  };
}

/**
 * As conversas em que algum modelo discorda da referência. São elas que uma
 * pessoa precisa olhar: onde todos concordam, o sistema e a IA dizem o mesmo e
 * é improvável que ambos errem do mesmo jeito. As decididas por pessoas vêm
 * primeiro, depois as de maior confiança da IA.
 */
export function divergentes(linhas: LinhaDoTeste[], modelos: string[]): LinhaDoTeste[] {
  const forca = (l: LinhaDoTeste) => Math.max(0, ...modelos.map((m) => l.porModelo[m]?.confianca ?? 0));
  return linhas
    .filter((l) =>
      modelos.some((m) => {
        const a = l.porModelo[m];
        return a && a.vendaIA !== null && a.vendaIA !== (referencia(l).valor === "VENDA");
      }),
    )
    .sort((a, b) => Number(b.humano !== null) - Number(a.humano !== null) || forca(b) - forca(a));
}

// ---------------------------------------------------------------- planilha

const aspas = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A planilha que a pessoa preenche: na coluna `verdade`, o que de fato aconteceu (VENDA ou SEM_VENDA). */
export function revisaoEmCsv(linhas: LinhaDoTeste[], modelos: string[]): string {
  const cabecalho = ["id", "organizacao", "referencia", "origem_da_referencia", ...modelos.map((m) => `ia_${m}`), "valor_ia", "evidencias_ia", "verdade"];
  const corpo = linhas.map((l) => {
    const ref = referencia(l);
    const primeira = l.porModelo[modelos[0]];
    return [
      l.id,
      l.organizacao,
      ref.valor,
      ref.origem,
      ...modelos.map((m) => {
        const a = l.porModelo[m];
        return a?.vendaIA === null || !a ? "erro" : `${a.vendaIA ? "VENDA" : "SEM_VENDA"} (${Math.round((a.confianca ?? 0) * 100)}%)`;
      }),
      primeira?.valorEmCentavos != null ? (primeira.valorEmCentavos / 100).toFixed(2).replace(".", ",") : "",
      (primeira?.evidencias ?? []).join(" | "),
      "",
    ].map(aspas);
  });
  return [cabecalho.map(aspas), ...corpo].map((l) => l.join(",")).join("\n") + "\n";
}

/** Lê o CSV de volta, com aspas, vírgulas e quebras de linha dentro dos campos. */
export function leCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (c === '"') dentro = false;
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo);
      campo = "";
      if (linha.some((x) => x !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    if (linha.some((x) => x !== "")) linhas.push(linha);
  }
  return linhas;
}

export interface AvaliacaoDaRevisao {
  julgadas: number;
  /** Quantas vezes o sistema de hoje (a referência) acertou entre as julgadas. */
  referenciaAcertou: number;
  porModelo: { modelo: string; acertou: number; vendasAcertadas: number; vendasReais: number; falsasVendas: number }[];
}

/** Compara cada modelo e a referência com a verdade que a pessoa escreveu na planilha. */
export function avaliaRevisao(linhas: LinhaDoTeste[], modelos: string[], planilha: string[][]): AvaliacaoDaRevisao {
  const [cabecalho, ...corpo] = planilha;
  const iId = cabecalho.indexOf("id");
  const iVerdade = cabecalho.indexOf("verdade");
  const verdades = new Map<string, Verdade>();
  for (const l of corpo) {
    const v = (l[iVerdade] ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    if (v === "VENDA" || v === "SEM_VENDA") verdades.set(l[iId], v);
  }
  const julgadas = linhas.filter((l) => verdades.has(l.id));
  return {
    julgadas: julgadas.length,
    referenciaAcertou: julgadas.filter((l) => referencia(l).valor === verdades.get(l.id)).length,
    porModelo: modelos.map((modelo) => {
      const validas = julgadas.filter((l) => l.porModelo[modelo]?.vendaIA != null);
      const diz = (l: LinhaDoTeste) => (l.porModelo[modelo].vendaIA ? "VENDA" : "SEM_VENDA");
      return {
        modelo,
        acertou: validas.filter((l) => diz(l) === verdades.get(l.id)).length,
        vendasReais: validas.filter((l) => verdades.get(l.id) === "VENDA").length,
        vendasAcertadas: validas.filter((l) => verdades.get(l.id) === "VENDA" && diz(l) === "VENDA").length,
        falsasVendas: validas.filter((l) => verdades.get(l.id) === "SEM_VENDA" && diz(l) === "VENDA").length,
      };
    }),
  };
}

// -------------------------------------------------------------------- HTML

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dolar = (v: number) => `US$ ${v.toFixed(v < 1 ? 4 : 2)}`;
const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : "sem casos");

export function relatorioEmHtml(args: {
  linhas: LinhaDoTeste[];
  modelos: string[];
  geradoEm: Date;
  limiteDeDivergencias?: number;
}): string {
  const { linhas, modelos, geradoEm, limiteDeDivergencias = 60 } = args;
  const resumos = modelos.map((m) => resumoDoModelo(linhas, m));
  const lista = divergentes(linhas, modelos);

  const tabela = (cabecalho: string[], corpo: string[][]) =>
    `<table><thead><tr>${cabecalho.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${corpo
      .map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;

  const custo = tabela(
    ["Modelo", "Conversas", "Custo por 1.000", "Custo total", "Tokens (entrada / saída)", "Tempo médio", "Erros", "Citou o que não existe"],
    resumos.map((r) => [
      `<b>${esc(r.modelo)}</b>`,
      String(r.analisadas),
      dolar(r.custoPorMil),
      dolar(r.custoTotal),
      `${r.tokensEntradaMedio} / ${r.tokensSaidaMedio}`,
      `${(r.msMedio / 1000).toFixed(1)} s`,
      String(r.erros),
      String(r.comCitacaoInventada),
    ]),
  );

  const pessoas = tabela(
    ["Modelo", "Vendas confirmadas por pessoas: a IA achou", "Casos decididos como sem venda: a IA disse venda"],
    resumos.map((r) => [
      `<b>${esc(r.modelo)}</b>`,
      `${r.contraPessoas.iaEncontrou} de ${r.contraPessoas.vendasConfirmadas} (${pct(r.contraPessoas.iaEncontrou, r.contraPessoas.vendasConfirmadas)})`,
      `${r.contraPessoas.iaDisseVenda} de ${r.contraPessoas.semVendaDecidida}`,
    ]),
  );

  const sistema = tabela(
    ["Modelo", "A regra de palavras detectou venda e ninguém confirmou: a IA concorda em", "Sem venda no sistema: a IA vê venda em"],
    resumos.map((r) => [
      `<b>${esc(r.modelo)}</b>`,
      `${r.contraSistema.iaConcorda} de ${r.contraSistema.regraSemConfirmacao} (${pct(r.contraSistema.iaConcorda, r.contraSistema.regraSemConfirmacao)})`,
      `${r.contraSistema.iaVeVendaPerdida} de ${r.contraSistema.semVendaNoSistema}`,
    ]),
  );

  const cartoes = lista
    .slice(0, limiteDeDivergencias)
    .map((l) => {
      const ref = referencia(l);
      const veredictos = modelos
        .map((m) => {
          const a = l.porModelo[m];
          if (!a || a.vendaIA === null) return `<li><b>${esc(m)}</b>: erro (${esc(a?.erro ?? "sem resposta")})</li>`;
          const valor = a.valorEmCentavos != null ? `, valor R$ ${(a.valorEmCentavos / 100).toFixed(2).replace(".", ",")}` : "";
          const evidencias = a.evidencias.length ? `<br>Trechos: ${a.evidencias.map((e) => `"${esc(e)}"`).join(" | ")}` : "";
          const inventadas = a.citacoesInvalidas ? ` <span class="alerta">(${a.citacoesInvalidas} trecho(s) citado(s) não existem)</span>` : "";
          return `<li><b>${esc(m)}</b>: ${esc(a.situacao ?? "")} (${Math.round((a.confianca ?? 0) * 100)}%)${valor}${inventadas}<br>${esc(a.motivo ?? "")}${evidencias}</li>`;
        })
        .join("");
      return `<details><summary><code>${esc(l.id)}</code> ${esc(l.organizacao)} &nbsp; referência: <b>${ref.valor}</b> (${ref.origem}) &nbsp; ${l.mensagens} mensagens</summary><ul>${veredictos}</ul><pre>${esc(l.transcricao)}</pre></details>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Teste da IA de vendas</title><style>
body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;color:#1b1b1b}
h1{font-size:22px}h2{font-size:17px;margin-top:32px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top;font-size:14px}th{background:#f4f4f4}
details{border:1px solid #ddd;border-radius:6px;padding:8px 12px;margin:8px 0}summary{cursor:pointer}
pre{white-space:pre-wrap;background:#f7f7f7;padding:10px;border-radius:6px;font-size:13px}.alerta{color:#b00020}.nota{color:#555;font-size:13px}
</style></head><body>
<h1>Teste da IA de vendas</h1>
<p class="nota">Gerado em ${esc(geradoEm.toLocaleString("pt-BR"))}. ${linhas.length} conversas, enviadas sem nome, telefone e e-mail. Este arquivo contém o texto das conversas: não compartilhe nem versione.</p>
<h2>Custo e velocidade, medidos</h2>${custo}
<p class="nota">O custo vem dos tokens que a API informou em cada resposta, com o preço de tabela. Em lote (resposta em até 24 horas) custa a metade.</p>
<h2>Contra o que pessoas decidiram</h2>${pessoas}
<h2>Contra o sistema de hoje (regra de palavras)</h2>${sistema}
<h2>Conversas para você julgar (${Math.min(lista.length, limiteDeDivergencias)} de ${lista.length})</h2>
<p class="nota">Aqui a IA discorda da referência. Abra a conversa e diga o que de fato aconteceu na planilha <code>revisao.csv</code>, coluna <code>verdade</code> (VENDA ou SEM_VENDA). Depois rode o teste com <code>--avaliar</code> para ver quem acertou mais.</p>
${cartoes || "<p>Nenhuma divergência.</p>"}
</body></html>`;
}
