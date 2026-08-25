/** Cents (Int, never float — Section 48) to a BRL-formatted string. */
export function formatCentsAsBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
