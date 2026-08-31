"use client";

import { useTransition } from "react";
import { disconnectMeta, triggerMetaSync } from "./actions";
import { Button } from "@/components/ui/button";

export function ConnectionActions() {
  const [disconnecting, startDisconnect] = useTransition();
  const [syncing, startSync] = useTransition();

  return (
    <div className="flex gap-3 pt-2">
      <Button onClick={() => startSync(() => triggerMetaSync())} loading={syncing} size="sm">
        {syncing ? "Sincronizando" : "Sincronizar agora"}
      </Button>
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
