/** A cor do cliente como um quadrado. A cor vem do banco e só entra como estilo, nunca como HTML. */
export function CorDoCliente({ cor, className = "h-4 w-4" }: { cor: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-md border border-line ${className}`}
      style={{ backgroundColor: cor ?? "transparent" }}
    />
  );
}
