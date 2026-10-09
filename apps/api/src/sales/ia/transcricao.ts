export interface MensagemDaConversa {
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  timestamp: Date;
}

export interface Transcricao {
  texto: string;
  /** Mensagens que entraram no texto. */
  mensagens: number;
  /** Mensagens do começo que ficaram de fora por causa do limite. */
  omitidas: number;
  /** Mensagens sem texto (áudio, imagem), marcadas no texto como mídia. */
  midias: number;
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);

/** Digitos de um trecho, para decidir se é telefone ou documento e não um valor em reais. */
const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Tira o que identifica a pessoa antes de a conversa sair da máquina:
 * e-mail, telefone, CPF e CNPJ (qualquer sequência de 10 dígitos ou mais) e o
 * nome do lead. Valores em reais ficam: "R$ 2.500.000" tem 7 dígitos.
 *
 * Não é à prova de tudo: um nome que o cliente digita errado, ou o nome de
 * outra pessoa, passa. Por isso o texto só vai para a IA com a confirmação
 * de quem roda o teste.
 */
export function anonimiza(texto: string, nomes: string[] = []): string {
  let saida = texto.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]");
  saida = saida.replace(/\+?\d[\d\s().\/-]{6,}\d/g, (trecho) => (soDigitos(trecho).length >= 10 ? "[número]" : trecho));

  const partes = nomes
    .flatMap((nome) => nome.split(/\s+/))
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && !PARTICULAS.has(p.toLowerCase()));
  for (const parte of new Set(partes)) {
    const escapada = parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    saida = saida.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapada}(?![\\p{L}\\p{N}])`, "giu"), "[cliente]");
  }
  return saida;
}

const formataDia = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(d);
const formataHora = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/**
 * A conversa como texto, uma mensagem por linha, com marcador de dia e quem
 * falou. Conversas enormes (grupos, robôs) ficam com as últimas `max`
 * mensagens: é no fim que a venda acontece.
 */
export function montaTranscricao(
  mensagens: MensagemDaConversa[],
  opcoes: { nomes?: string[]; max?: number; fuso?: string } = {},
): Transcricao {
  const { nomes = [], max = 300, fuso = "America/Sao_Paulo" } = opcoes;
  const ordenadas = [...mensagens].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const omitidas = Math.max(0, ordenadas.length - max);
  const usadas = ordenadas.slice(omitidas);

  const linhas: string[] = [];
  if (omitidas > 0) linhas.push(`(${omitidas} mensagens do começo da conversa foram omitidas)`);

  let diaAtual = "";
  let midias = 0;
  for (const mensagem of usadas) {
    const dia = formataDia(mensagem.timestamp, fuso);
    if (dia !== diaAtual) {
      linhas.push(`--- ${dia} ---`);
      diaAtual = dia;
    }
    const quem = mensagem.direction === "INBOUND" ? "Cliente" : "Equipe";
    const texto = mensagem.text?.replace(/\s+/g, " ").trim();
    if (!texto) midias += 1;
    linhas.push(`[${formataHora(mensagem.timestamp, fuso)}] ${quem}: ${texto ? anonimiza(texto, nomes) : "[mídia ou áudio]"}`);
  }
  return { texto: linhas.join("\n"), mensagens: usadas.length, omitidas, midias };
}
