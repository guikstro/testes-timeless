import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Códigos de recuperação: a saída para quando o telefone se perde.
 *
 * Sem eles, ativar o segundo fator é uma forma de perder a conta. Com eles, o
 * pior caso é um papel guardado.
 *
 * **Guardados como SHA-256, e não com bcrypt.** A diferença tem razão e não é
 * descuido: o bcrypt existe para tornar caro adivinhar segredo escolhido por
 * gente, que é pouco entrópico. Estes são 128 bits de aleatório gerados aqui,
 * onde não há o que adivinhar, e conferir dez deles com bcrypt a cada
 * tentativa custaria caro sem comprar segurança nenhuma.
 */

export const QUANTIDADE = 10;

/**
 * Alfabeto sem os caracteres que se confundem lidos de um papel.
 *
 * Fora: 0/O, 1/I/L, 2/Z, 5/S, 8/B. Um código de recuperação é transcrito à
 * mão, meses depois, muitas vezes com pressa — cada ambiguidade aqui vira uma
 * pessoa trancada fora da conta achando que o código não presta.
 */
const ALFABETO = "ACDEFGHJKMNPQRTUVWXY34679";
const GRUPOS = 2;
const POR_GRUPO = 5;

/** Um código legível: `ACDEF-GHJKM`. */
export function geraCodigo(): string {
  const partes: string[] = [];
  for (let g = 0; g < GRUPOS; g += 1) {
    let parte = "";
    // randomBytes por caractere, com rejeição do resto, para não enviesar o
    // alfabeto como `% ALFABETO.length` faria.
    while (parte.length < POR_GRUPO) {
      const byte = randomBytes(1)[0];
      const limite = Math.floor(256 / ALFABETO.length) * ALFABETO.length;
      if (byte < limite) parte += ALFABETO[byte % ALFABETO.length];
    }
    partes.push(parte);
  }
  return partes.join("-");
}

export function geraLote(quantos = QUANTIDADE): string[] {
  const codigos = new Set<string>();
  // Colisão é improvável a ponto de ser irrelevante, mas um lote com dois
  // códigos iguais daria ao usuário nove chances onde ele conta dez.
  while (codigos.size < quantos) codigos.add(geraCodigo());
  return [...codigos];
}

/**
 * Normaliza antes de comparar.
 *
 * A pessoa vai digitar em minúscula, com ou sem o hífen, às vezes com espaço.
 * Recusar por causa disso seria recusar por formatação, não por segredo.
 */
export function normaliza(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashDoCodigo(codigo: string): string {
  return createHash("sha256").update(normaliza(codigo)).digest("hex");
}

/**
 * Encontra o código apresentado entre os guardados, em tempo constante.
 *
 * A comparação percorre a lista inteira mesmo depois de achar: sair no
 * primeiro acerto deixaria o tempo de resposta contar em que posição o código
 * estava, que é pouco, mas é grátis não vazar.
 */
export function encontraCodigo<T extends { codeHash: string; usadoEm: Date | null }>(
  guardados: T[],
  apresentado: string,
): T | null {
  const alvo = Buffer.from(hashDoCodigo(apresentado));
  let achado: T | null = null;

  for (const guardado of guardados) {
    const atual = Buffer.from(guardado.codeHash);
    const bate = atual.length === alvo.length && timingSafeEqual(atual, alvo);
    // Código já usado não vale de novo: é de uso único por definição.
    if (bate && guardado.usadoEm === null) achado = guardado;
  }

  return achado;
}
