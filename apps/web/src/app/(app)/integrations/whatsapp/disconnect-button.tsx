"use client";

import { useTransition } from "react";
import { disconnectWhatsApp } from "./actions";

export function DisconnectButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => disconnectWhatsApp())}
      disabled={pending}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-panel-soft disabled:opacity-50"
    >
      {pending ? "Desconectando..." : "Desconectar"}
    </button>
  );
}
