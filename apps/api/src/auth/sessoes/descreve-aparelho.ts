/**
 * "Chrome no macOS", a partir do que o navegador diz de si.
 *
 * Sem biblioteca de análise de user agent, e de propósito: a tela precisa
 * reconhecer os cinco navegadores e os cinco sistemas que alguém de fato usa
 * para abrir este painel, não catalogar dez mil aparelhos. Quando não
 * reconhece, diz que não reconhece, em vez de adivinhar.
 *
 * A ordem das conferências importa, e o motivo é o formato do user agent:
 * quase todo navegador se declara compatível com os outros. O Edge diz que é
 * Chrome, o Chrome diz que é Safari, o Opera diz que é os dois. Então se
 * pergunta pelo mais específico primeiro.
 */

export interface Aparelho {
  navegador: string | null;
  sistema: string | null;
  /** Telefone ou tablet. Serve para o ícone e para a pessoa se localizar. */
  movel: boolean;
}

const NAVEGADORES: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  // Chrome antes de Safari: o Chrome se anuncia como Safari também.
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SISTEMAS: Array<[RegExp, string]> = [
  // iPad e iPhone antes de macOS: o Safari do iPad moderno se diz Mac.
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function descreveAparelho(userAgent: string | null | undefined): Aparelho {
  if (!userAgent) return { navegador: null, sistema: null, movel: false };

  const navegador = NAVEGADORES.find(([padrao]) => padrao.test(userAgent))?.[1] ?? null;
  const sistema = SISTEMAS.find(([padrao]) => padrao.test(userAgent))?.[1] ?? null;
  const movel = /Mobile|iPhone|iPad|Android/.test(userAgent);

  return { navegador, sistema, movel };
}

/** A frase que vai para a tela. */
export function rotuloDoAparelho(aparelho: Aparelho): string {
  if (aparelho.navegador && aparelho.sistema) return `${aparelho.navegador} no ${aparelho.sistema}`;
  if (aparelho.navegador) return aparelho.navegador;
  if (aparelho.sistema) return `Navegador no ${aparelho.sistema}`;
  return "Aparelho não identificado";
}
