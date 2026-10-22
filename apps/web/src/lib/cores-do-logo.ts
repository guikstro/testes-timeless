/**
 * As cores que mandam num logo, para sugerir a cor da marca.
 *
 * Agrupa os pixels em caixas de cor e devolve as mais frequentes, deixando de
 * fora o que não serve de acento: quase branco, quase preto, cinza e pixel
 * transparente (o fundo de um PNG). Duas cores parecidas contam como uma.
 */
export type Rgb = [number, number, number];

export function coresDominantes(pixels: Uint8ClampedArray, quantas = 4): string[] {
  const caixas = new Map<number, { soma: Rgb; n: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturacao = max === 0 ? 0 : (max - min) / max;
    if (max > 240 && min > 225) continue; // quase branco
    if (max < 35) continue; // quase preto
    if (saturacao < 0.22) continue; // cinza
    const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const caixa = caixas.get(chave) ?? { soma: [0, 0, 0] as Rgb, n: 0 };
    caixa.soma = [caixa.soma[0] + r, caixa.soma[1] + g, caixa.soma[2] + b];
    caixa.n += 1;
    caixas.set(chave, caixa);
  }

  const escolhidas: Rgb[] = [];
  const ordenadas = [...caixas.values()].sort((a, b) => b.n - a.n);
  for (const { soma, n } of ordenadas) {
    const cor: Rgb = [Math.round(soma[0] / n), Math.round(soma[1] / n), Math.round(soma[2] / n)];
    if (escolhidas.every((outra) => distancia(outra, cor) > 60)) escolhidas.push(cor);
    if (escolhidas.length === quantas) break;
  }
  return escolhidas.map(paraHex);
}

function distancia(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function paraHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Lê a imagem num canvas pequeno e devolve as cores. Null quando o navegador não deixa ler. */
export function coresDaImagem(imagem: HTMLImageElement): string[] | null {
  const lado = 96;
  const canvas = document.createElement("canvas");
  const escala = Math.min(1, lado / Math.max(imagem.naturalWidth, imagem.naturalHeight, 1));
  canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const contexto = canvas.getContext("2d");
  if (!contexto) return null;
  contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  try {
    return coresDominantes(contexto.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    // Imagem de outro endereço sem permissão: o navegador bloqueia a leitura.
    return null;
  }
}
