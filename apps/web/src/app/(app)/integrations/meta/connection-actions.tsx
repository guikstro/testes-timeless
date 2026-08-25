"use client";

import { useTransition } from "react";
import { disconnectMeta, triggerMetaSync } from "./actions";

export function ConnectionActions() {
  const [disconnecting, startDisconnect] = useTransition();
  const [syncing, startSync] = useTransition();

  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={() => startSync(() => triggerMetaSync())}
        disabled={syncing}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {syncing ? "Sincronizando..." : "Sincronizar agora"}
      </button>
      <button
        onClick={() => startDisconnect(() => disconnectMeta())}
        disabled={disconnecting}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {disconnecting ? "Desconectando..." : "Desconectar"}
      </button>
    </div>
  );
}
