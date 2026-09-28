import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mensagem em linha, dentro da tela: "o WhatsApp caiu", "a sincronização
 * parou". Existia escrita à mão em cada tela, cada uma com o seu âmbar.
 *
 * O tom vem com ícone, e não só com cor, para o significado não depender de
 * distinguir cores. `role="status"` para avisos e `alert` para erro, que o
 * leitor de tela interrompe para ler.
 */
export type TomDoAviso = "info" | "success" | "warning" | "danger";

const TONS: Record<TomDoAviso, string> = {
  info: "border-info-line/70 bg-info-soft text-info",
  success: "border-success-line/70 bg-success-soft text-success",
  warning: "border-warning-line/70 bg-warning-soft text-warning",
  danger: "border-danger-line/70 bg-danger-soft text-danger",
};

const ICONES: Record<TomDoAviso, ReactNode> = {
  info: <path d="M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  success: <path d="m8 12.5 2.5 2.5L16 9.5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  warning: (
    <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  ),
  danger: <path d="M12 8v5M12 16h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
};

export function Alert({
  tom = "info",
  titulo,
  children,
  acao,
  className,
}: {
  tom?: TomDoAviso;
  titulo?: ReactNode;
  children?: ReactNode;
  /** Um botão ou link que resolve o aviso. */
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tom === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        TONS[tom],
        className,
      )}
    >
      <div className="flex min-w-0 gap-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-[18px] w-[18px] shrink-0"
          aria-hidden
        >
          {ICONES[tom]}
        </svg>
        <div className="min-w-0">
          {titulo ? <p className="text-corpo font-semibold">{titulo}</p> : null}
          {children ? (
            <div className={cn("text-apoio leading-relaxed opacity-90", titulo ? "mt-1" : null)}>{children}</div>
          ) : null}
        </div>
      </div>
      {acao ? <div className="shrink-0 sm:ml-4">{acao}</div> : null}
    </div>
  );
}
