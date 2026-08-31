"use client";

import { useCallback, useEffect, useRef, useState } from "react";
/* eslint-disable @next/next/no-img-element -- o QR vem como data URI do provider, não é um asset local que o next/image possa otimizar. */
import { pollQrCode, refreshWhatsAppPage, startQrCodeConnection, QrCodeState } from "./actions";
import { Button } from "@/components/ui/button";

/** A Evolution rotaciona o QR a cada ~30s; buscar a cada 5s garante um código sempre válido na tela. */
const POLL_INTERVAL_MS = 5000;

type Phase = "idle" | "starting" | "waiting" | "connected" | "error";

export function QrConnect({ alreadyPending }: { alreadyPending: boolean }) {
  const [phase, setPhase] = useState<Phase>(alreadyPending ? "waiting" : "idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guarda o timer para poder cancelá-lo tanto ao conectar quanto ao
  // desmontar — sem isso, sair da página deixaria um polling infinito.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const apply = useCallback(
    (result: QrCodeState | { error: string }) => {
      if ("error" in result) {
        setError(result.error);
        setPhase("error");
        stopPolling();
        return;
      }

      setError(null);
      if (result.status === "CONNECTED") {
        setPhase("connected");
        setQrCode(null);
        stopPolling();
        // Recarrega os dados do servidor para o card de status mostrar o
        // número que acabou de conectar.
        void refreshWhatsAppPage();
        return;
      }

      setPhase("waiting");
      setQrCode(result.qrCodeBase64);
    },
    [stopPolling],
  );

  useEffect(() => {
    if (phase !== "waiting") return;

    // Uma busca imediata evita a tela ficar vazia até o primeiro intervalo.
    void pollQrCode().then(apply);
    timerRef.current = setInterval(() => void pollQrCode().then(apply), POLL_INTERVAL_MS);
    return stopPolling;
  }, [phase, apply, stopPolling]);

  async function start() {
    setPhase("starting");
    setError(null);
    apply(await startQrCodeConnection());
  }

  if (phase === "connected") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        WhatsApp conectado. Já pode receber e responder mensagens.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-6">
      <h2 className="text-sm font-semibold text-ink">Conectar por QR Code</h2>
      <p className="mt-1 text-sm text-ink-mute">
        Abra o WhatsApp no celular, toque em <span className="font-medium">Aparelhos conectados</span> e leia o código
        abaixo. Não é preciso configurar nada na Meta.
      </p>

      {phase === "idle" ? (
        <Button onClick={() => void start()} className="mt-4">
          Gerar QR Code
        </Button>
      ) : null}

      {phase === "starting" ? <p className="mt-4 text-sm text-ink-mute">Preparando a conexão...</p> : null}

      {phase === "waiting" ? (
        <div className="mt-4">
          {qrCode ? (
            <img
              src={qrCode}
              alt="QR Code para conectar o WhatsApp"
              className="h-64 w-64 rounded-lg border border-line bg-panel p-2"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-mute">
              Gerando código...
            </div>
          )}
          <p className="mt-3 text-xs text-ink-mute">
            O código se renova sozinho a cada poucos segundos. Assim que você ler, esta tela muda automaticamente.
          </p>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="mt-4">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => void start()}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-panel-soft"
          >
            Tentar de novo
          </button>
        </div>
      ) : null}
    </div>
  );
}
