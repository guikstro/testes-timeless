import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const FIELD =
  "w-full rounded-xl border border-line bg-panel px-3.5 text-sm text-ink shadow-subtle " +
  "transition-all duration-200 ease-soft placeholder:text-ink-mute " +
  "hover:border-line focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 " +
  "disabled:cursor-not-allowed disabled:bg-panel-soft disabled:text-ink-mute";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(FIELD, "h-10", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(FIELD, "h-10 cursor-pointer appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
});

/**
 * Rótulo ligado ao campo por id gerado, não por posição visual: sem o `for`,
 * clicar no rótulo não foca o campo e o leitor de tela anuncia um campo sem nome.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-corpo font-medium text-ink-soft">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="animate-fade-in text-apoio text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-apoio text-ink-mute">{hint}</p>
      ) : null}
    </div>
  );
}
