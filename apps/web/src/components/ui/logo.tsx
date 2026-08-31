"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Logo da organização, com a inicial como reserva.
 *
 * A reserva não é só para quem não configurou logo: uma URL externa pode
 * cair a qualquer momento, e `onError` garante que a marca degrade para a
 * inicial em vez de deixar um ícone quebrado no topo de todas as telas.
 */
export function OrgLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL externa arbitrária, fora do otimizador
      <img
        src={logoUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={cn("h-9 w-9 shrink-0 rounded-xl object-cover shadow-subtle", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand font-display text-sm font-bold text-white shadow-subtle",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
