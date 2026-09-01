"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantém o quadro atualizado sozinho.
 *
 * Escolhi consulta periódica em vez de um canal de eventos no servidor. Um
 * canal seria mais elegante, mas custa uma conexão aberta por pessoa e
 * infraestrutura nova; para uma fila que muda a cada minutos, perguntar de vez
 * em quando entrega a mesma sensação por muito menos.
 *
 * Três travas, e cada uma existe por um incômodo concreto:
 *
 * - Pausa com a aba escondida. Sem isso, dez abas esquecidas viram dez
 *   consultas por minuto contra o servidor, para ninguém ver.
 * - Pausa enquanto alguém arrasta ou digita. O quadro recarregar por baixo da
 *   mão que arrasta é pior que ficar desatualizado por um minuto.
 * - Volta a perguntar assim que a aba reaparece, sem esperar o próximo ciclo,
 *   porque é justamente ao voltar que a pessoa quer ver o que mudou.
 */
const INTERVALO = 20_000;

export function LiveRefresh({ pausado }: { pausado: boolean }) {
  const router = useRouter();
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;

  useEffect(() => {
    function atualizar() {
      if (pausadoRef.current || document.hidden) return;
      router.refresh();
      setAtualizadoEm(Date.now());
    }

    const relogio = window.setInterval(atualizar, INTERVALO);

    function aoVoltar() {
      if (!document.hidden) atualizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-mute" aria-live="polite">
      <span className="relative flex h-1.5 w-1.5">
        {!pausado ? (
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-70 motion-safe:animate-ping" />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${pausado ? "bg-ink-mute" : "bg-accent"}`} />
      </span>
      {pausado ? "Pausado" : "Ao vivo"}
      {atualizadoEm ? <span className="sr-only">Quadro atualizado</span> : null}
    </span>
  );
}
