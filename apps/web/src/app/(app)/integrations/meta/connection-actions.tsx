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
        className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-canvas hover:bg-ink disabled:opacity-50"
      >
        {syncing ? "Sincronizando..." : "Sincronizar agora"}
      </button>
      <button
        onClick={() => startDisconnect(() => disconnectMeta())}
        disabled={disconnecting}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-panel-soft disabled:opacity-50"
      >
        {disconnecting ? "Desconectando..." : "Desconectar"}
      </button>
    </div>
  );
}
