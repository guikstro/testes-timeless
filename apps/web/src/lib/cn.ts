/**
 * Junta classes ignorando falsos. Deliberadamente sem `tailwind-merge`, que é
 * uma dependência a mais por pouco ganho.
 *
 * Atenção: isto **não** resolve conflito. Entre `w-full` e `w-40` na mesma
 * lista, vence a que o Tailwind gera por último no CSS, e não a que vem por
 * último no atributo. Por isso as primitivas não trazem largura, cor de
 * marcado nem outro valor que quem usa precise trocar: esses ficam fora da
 * base, para o `className` de quem usa não brigar com ela.
 */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
