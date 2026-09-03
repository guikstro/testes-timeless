/**
 * Deriva a paleta inteira a partir de uma cor só.
 *
 * O cliente escolhe uma cor; a interface precisa de várias. Pedir todas seria
 * transferir um problema de design para quem só quer usar a marca dele.
 *
 * Antes isto devolvia três tons e só pintava o menu e os botões: o dashboard
 * usava um acento fixo, então trocar a cor da marca não mudava a tela mais
 * vista do produto. Agora a cor escolhida comanda também o acento e as séries
 * dos gráficos.
 */
export interface BrandPalette {
  base: string;
  soft: string;
  ink: string;
  /** O acento da interface, usado em destaques, brilhos e no gráfico. */
  accent: string;
  /**
   * O que se escreve **em cima** do acento.
   *
   * Calculado pela luminância, e não fixo em branco: branco sobre um amarelo
   * ou um laranja claro cai abaixo do contraste mínimo, e o texto some.
   */
  accentContrast: string;
  /** Primeira série do gráfico: a própria marca. */
  serie1: string;
  /**
   * Segunda série. Hue oposto e luminosidade deslocada, para não depender só
   * do tom: quem não separa verde de vermelho ainda enxerga a diferença de
   * claridade, e a linha tracejada resolve o resto.
   */
  serie2: string;
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

const canais = (rgb: number[]) => rgb.map((valor) => Math.round(Math.min(255, Math.max(0, valor)))).join(" ");

/** Luminância relativa, na fórmula do WCAG. */
function luminancia([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function paraHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function paraRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    let tt = (t + 1) % 1;
    if (tt < 0) tt += 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hn = h / 360;
  return [canal(hn + 1 / 3) * 255, canal(hn) * 255, canal(hn - 1 / 3) * 255];
}

/** Timeless: verde #007D5E. É o que vale quando a organização não escolheu cor. */
const PADRAO: BrandPalette = {
  base: "0 125 94",
  soft: "232 242 238",
  ink: "0 95 71",
  accent: "0 125 94",
  accentContrast: "255 255 255",
  serie1: "0 125 94",
  serie2: "217 119 6",
};

export function brandPalette(hex: string | null | undefined): BrandPalette {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return PADRAO;

  const [h, s, l] = paraHsl(rgb);

  // Hue oposto para a segunda série, com claridade empurrada para o lado
  // contrário: se a marca é escura, a segunda é clara, e vice-versa.
  const segundaClaridade = l > 0.5 ? Math.max(0.32, l - 0.24) : Math.min(0.68, l + 0.24);
  const serie2 = paraRgb([(h + 180) % 360, Math.max(0.45, Math.min(0.9, s)), segundaClaridade]);

  return {
    base: canais(rgb),
    // Fundo suave: quase branco, só o suficiente para a cor se anunciar.
    soft: canais(rgb.map((valor) => valor + (255 - valor) * 0.93)),
    // Tom escuro para texto sobre o fundo suave, onde a cor cheia costuma não
    // ter contraste suficiente.
    ink: canais(rgb.map((valor) => valor * 0.62)),
    accent: canais(rgb),
    accentContrast: luminancia(rgb) > 0.42 ? "3 4 3" : "255 255 255",
    serie1: canais(rgb),
    serie2: canais(serie2),
  };
}
