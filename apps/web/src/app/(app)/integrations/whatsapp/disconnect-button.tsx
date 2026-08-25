"use client";

import { useTransition } from "react";
import { disconnectWhatsApp } from "./actions";

export function DisconnectButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => disconnectWhatsApp())}
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? "Desconectando..." : "Desconectar"}
    </button>
  );
}
