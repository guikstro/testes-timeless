/**
 * Validação de imagem enviada pelo cliente.
 *
 * Recebida em base64 no corpo JSON, e não por multipart, para não acrescentar
 * dependência nem reconstruir a imagem do contêiner. O custo é o inchaço de um
 * terço do base64, coberto de sobra pelo limite de corpo que já existe.
 *
 * A validação olha os bytes, e não o que o cliente declarou. Confiar no tipo
 * anunciado permitiria enviar qualquer coisa com um cabeçalho de imagem, e o
 * arquivo passaria a ser servido do nosso domínio.
 */

export type TipoDeImagem = "image/png" | "image/jpeg" | "image/webp";

export interface ImagemValida {
  tipo: TipoDeImagem;
  extensao: string;
  bytes: Buffer;
}

export type ErroDaImagem =
  | "FORMATO_INVALIDO"
  | "TIPO_NAO_ACEITO"
  | "GRANDE_DEMAIS"
  | "CONTEUDO_NAO_CONFERE";

/**
 * Dois megabytes.
 *
 * Uma logo de interface não passa disso nem de longe, e o teto existe para o
 * disco não virar depósito: cada envio novo grava um arquivo.
 */
export const LIMITE_DE_BYTES = 2 * 1024 * 1024;

const EXTENSAO: Record<TipoDeImagem, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Assinaturas de cada formato, lidas do início do arquivo.
 *
 * SVG fica de fora de propósito, e não por esquecimento: ele é XML, aceita
 * script embutido, e servido do nosso domínio viraria execução de código de
 * terceiro na sessão de quem abrir a página.
 */
function tipoRealDe(bytes: Buffer): TipoDeImagem | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString("ascii") === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function validaImagem(dataUrl: string): { ok: true; imagem: ImagemValida } | { ok: false; erro: ErroDaImagem } {
  const casamento = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!casamento) return { ok: false, erro: "FORMATO_INVALIDO" };

  const declarado = casamento[1].toLowerCase();
  if (!(declarado in EXTENSAO)) return { ok: false, erro: "TIPO_NAO_ACEITO" };

  // O tamanho é conferido antes de decodificar: decodificar primeiro para só
  // então recusar seria alocar a memória que o limite existe para evitar.
  const tamanhoAproximado = Math.floor((casamento[2].length * 3) / 4);
  if (tamanhoAproximado > LIMITE_DE_BYTES) return { ok: false, erro: "GRANDE_DEMAIS" };

  const bytes = Buffer.from(casamento[2], "base64");
  if (bytes.length === 0 || bytes.length > LIMITE_DE_BYTES) return { ok: false, erro: "GRANDE_DEMAIS" };

  const real = tipoRealDe(bytes);
  // O que veio precisa ser o que diz ser: um PNG anunciado que na verdade é
  // outra coisa não entra.
  if (!real || real !== declarado) return { ok: false, erro: "CONTEUDO_NAO_CONFERE" };

  return { ok: true, imagem: { tipo: real, extensao: EXTENSAO[real], bytes } };
}
