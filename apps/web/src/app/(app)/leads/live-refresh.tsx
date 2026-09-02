"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useEventoDeNotificacao,
  useNotificacoes,
} from "@/components/notifications/notification-provider";

/**
 * Mantém o quadro atualizado sozinho.
 *
 * Antes isto perguntava ao servidor a cada vinte segundos. A escolha na época
 * era justificada por um canal de eventos custar uma conexão aberta por pessoa
 * e infraestrutura nova. Esse custo já foi pago: a conexão existe para os
 * avisos, e pendurar o quadro nela é de graça. O cartão passa a aparecer em
 * menos de um segundo em vez de esperar até vinte.
 *
 * Três travas continuam valendo, cada uma por um incômodo concreto:
 *
 * - Nada acontece enquanto alguém arrasta ou digita. O quadro recarregar por
 *   baixo da mão que arrasta é pior que ficar desatualizado por um instante.
 * - Nada acontece com a aba escondida; ao voltar, atualiza na hora, porque é
 *   justamente ao voltar que a pessoa quer ver o que mudou.
 * - Com o cano caído, volta a perguntar de tempos em tempos. Sem essa rede de
 *   segurança, uma falha de conexão deixaria o quadro parado sem ninguém
 *   perceber.
 */
const INTERVALO_DE_RESERVA = 30_000;

export function LiveRefresh({ pausado }: { pausado: boolean }) {
  const router = useRouter();
  const { conectado } = useNotificacoes();
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;

  const atualizar = useCallback(() => {
    if (pausadoRef.current || document.hidden) return;
    router.refresh();
    setAtualizadoEm(Date.now());
  }, [router]);

  // Só o que mexe no quadro: uma falha de envio muda a conversa de um lead,
  // não a posição de nenhum cartão, e recarregar por causa dela seria
  // trabalho à toa embaixo de quem está arrastando.
  useEventoDeNotificacao((evento) => {
    if (evento.type === "message.failed") return;
    atualizar();
  });

  useEffect(() => {
    function aoVoltar() {
      if (!document.hidden) atualizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [atualizar]);

  useEffect(() => {
    if (conectado) return;
    const relogio = window.setInterval(atualizar, INTERVALO_DE_RESERVA);
    return () => window.clearInterval(relogio);
  }, [conectado, atualizar]);

  const rotulo = pausado ? "Pausado" : conectado ? "Ao vivo" : "Reconectando";
  const aceso = !pausado && conectado;

  return (
    <span className="inline-flex items-center gap-1.5 text-rotulo text-ink-mute" aria-live="polite">
      <span className="relative flex h-1.5 w-1.5">
        {aceso ? (
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-70 motion-safe:animate-ping" />
        ) : null}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${aceso ? "bg-accent" : "bg-ink-mute"}`} />
      </span>
      {rotulo}
      {atualizadoEm ? <span className="sr-only">Quadro atualizado</span> : null}
    </span>
  );
}
