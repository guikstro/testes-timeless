/**
 * Junta classes ignorando falsos. Deliberadamente sem `tailwind-merge`: as
 * primitivas colocam o `className` recebido por último, então a última classe
 * vence pela ordem do CSS — e uma dependência a mais não se paga por isso.
 */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
