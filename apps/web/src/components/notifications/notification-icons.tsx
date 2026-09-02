import { TipoDeNotificacao } from "@/lib/notifications/tipos";

const PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true,
};

/**
 * Um desenho por tipo, e uma cor por gravidade.
 *
 * A cor sozinha não carrega a informação: o desenho muda junto, para quem não
 * distingue verde de vermelho ler a mesma coisa.
 */
export function IconeDaNotificacao({ tipo }: { tipo: TipoDeNotificacao }) {
  if (tipo === "lead.won") {
    return (
      <svg {...PROPS}>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (tipo === "message.failed") {
    return (
      <svg {...PROPS}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
    );
  }
  if (tipo === "message.received") {
    return (
      <svg {...PROPS}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 8.6 8.4z" />
      </svg>
    );
  }
  if (tipo === "lead.qualified" || tipo === "lead.stage_changed") {
    return (
      <svg {...PROPS}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }
  return (
    <svg {...PROPS}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

export function corDaNotificacao(tipo: TipoDeNotificacao): string {
  if (tipo === "lead.won") return "text-emerald-600 dark:text-emerald-400";
  if (tipo === "message.failed") return "text-red-600 dark:text-red-400";
  return "text-accent";
}
