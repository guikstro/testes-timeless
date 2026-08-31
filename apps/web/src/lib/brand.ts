/**
 * Deriva a paleta de acento a partir de uma cor só.
 *
 * O cliente escolhe uma cor; a interface precisa de três — a cor cheia, um
 * fundo suave e um tom escuro que leia sobre esse fundo. Pedir as três seria
 * transferir um problema de design para quem só quer usar a marca dele.
 */
export interface BrandPalette {
  base: string;
  soft: string;
  ink: string;
}

const DEFAULT_PALETTE: BrandPalette = { base: "37 99 235", soft: "239 246 255", ink: "30 64 175" };

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

const channels = (rgb: number[]) => rgb.map((value) => Math.round(value)).join(" ");

export function brandPalette(hex: string | null | undefined): BrandPalette {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return DEFAULT_PALETTE;

  return {
    base: channels(rgb),
    // Fundo suave: quase branco, só o suficiente para a cor se anunciar.
    soft: channels(rgb.map((value) => value + (255 - value) * 0.93)),
    // Tom escuro para texto sobre o fundo suave — a cor cheia costuma não ter
    // contraste suficiente ali.
    ink: channels(rgb.map((value) => value * 0.62)),
  };
}
