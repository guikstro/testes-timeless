import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226), com `node:crypto`.
 *
 * Escrito aqui, e não trazido de uma dependência, por duas razões que valem
 * mais juntas que separadas:
 *
 * - O algoritmo é HMAC mais truncação. São quarenta linhas, e a stack já tem
 *   tudo de que elas precisam.
 * - **A RFC publica vetores de teste oficiais.** Isso é o ponto: esta
 *   implementação não é confiada, é conferida contra valores que o próprio
 *   padrão define, em três algoritmos e em seis instantes. Uma dependência
 *   daria a mesma garantia e mais superfície.
 *
 * O que NÃO se escreve à mão em lugar nenhum deste projeto continua valendo:
 * senha é bcrypt, cifra simétrica é a do Node. Truncação de HMAC não é
 * desenho de criptografia, é leitura de bytes.
 */

/** Passo de tempo padrão do RFC, e o que todo aplicativo autenticador usa. */
export const PASSO_EM_SEGUNDOS = 30;
const DIGITOS = 6;

/**
 * Quantos passos de tolerância para cada lado.
 *
 * Um, e não zero: o relógio do telefone quase nunca bate exatamente com o do
 * servidor, e trinta segundos de folga é a diferença entre "funciona" e
 * "funciona quando dá sorte". Também não mais que um: cada passo extra é meio
 * minuto a mais de vida para um código interceptado.
 */
const TOLERANCIA_EM_PASSOS = 1;

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Segredo novo, em base32, que é o formato que os autenticadores leem. */
export function geraSegredo(bytes = 20): string {
  const cru = randomBytes(bytes);
  let bits = "";
  for (const byte of cru) bits += byte.toString(2).padStart(8, "0");

  let saida = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    saida += ALFABETO_BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return saida;
}

export function decodificaBase32(segredo: string): Buffer {
  const limpo = segredo.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");

  let bits = "";
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice === -1) throw new Error(`Caractere inválido em base32: ${caractere}`);
    bits += indice.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** O passo de tempo de um instante. É ele que entra no HMAC. */
export function passoDe(instanteEmSegundos: number): number {
  return Math.floor(instanteEmSegundos / PASSO_EM_SEGUNDOS);
}

/**
 * HOTP: HMAC do contador, truncado dinamicamente (RFC 4226, seção 5.3).
 *
 * `algoritmo` existe só para os vetores da RFC, que cobrem SHA-1, SHA-256 e
 * SHA-512. Na prática todo autenticador usa SHA-1, e é o padrão aqui.
 */
export function geraCodigo(
  segredo: Buffer,
  contador: number,
  algoritmo: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));

  const hmac = createHmac(algoritmo, segredo).update(buffer).digest();

  // O último nibble diz de onde ler os quatro bytes. É isto que a RFC chama
  // de truncação dinâmica, e o motivo de o código não ser só os primeiros
  // dígitos do hash.
  const deslocamento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[deslocamento] & 0x7f) << 24) |
    ((hmac[deslocamento + 1] & 0xff) << 16) |
    ((hmac[deslocamento + 2] & 0xff) << 8) |
    (hmac[deslocamento + 3] & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

export interface CodigoAceito {
  valido: boolean;
  /**
   * O passo em que o código foi aceito.
   *
   * Vai para o banco e é o que impede reuso: um código interceptado e
   * repetido dentro da mesma janela precisa ser recusado, e sem guardar o
   * passo não há como saber que ele já foi usado.
   */
  passo: number | null;
}

/**
 * Confere um código contra o segredo, com tolerância de relógio.
 *
 * `ultimoPassoUsado` fecha a janela de reuso. Sem ele, quem enxergasse o
 * código por cima do ombro teria até um minuto e meio para entrar com ele.
 */
export function confereCodigo(
  segredoBase32: string,
  codigo: string,
  agoraEmSegundos: number = Math.floor(Date.now() / 1000),
  ultimoPassoUsado: number | null = null,
): CodigoAceito {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length !== DIGITOS) return { valido: false, passo: null };

  const segredo = decodificaBase32(segredoBase32);
  const atual = passoDe(agoraEmSegundos);

  for (let desvio = -TOLERANCIA_EM_PASSOS; desvio <= TOLERANCIA_EM_PASSOS; desvio += 1) {
    const passo = atual + desvio;

    // Já usado, ou de uma janela anterior a uma já usada: recusa antes de
    // comparar, porque um código válido reapresentado continua sendo reuso.
    if (ultimoPassoUsado !== null && passo <= ultimoPassoUsado) continue;

    if (iguais(geraCodigo(segredo, passo), limpo)) return { valido: true, passo };
  }

  return { valido: false, passo: null };
}

/**
 * Comparação de tempo constante.
 *
 * Os dois lados têm seis dígitos sempre, então o comprimento não vaza nada, e
 * `timingSafeEqual` não lança.
 */
function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * O endereço `otpauth://` que vira QR Code.
 *
 * O emissor aparece duas vezes de propósito, no rótulo e no parâmetro: é o que
 * faz o aplicativo mostrar "Timeless: fulano@..." em vez de só o e-mail, e é
 * o comportamento documentado pelo Google Authenticator.
 */
export function enderecoOtpAuth(emissor: string, conta: string, segredo: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const parametros = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    algorithm: "SHA1",
    digits: String(DIGITOS),
    period: String(PASSO_EM_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}
