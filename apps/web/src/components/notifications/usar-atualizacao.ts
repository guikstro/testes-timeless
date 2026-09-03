"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega a rota, agrupando pedidos.
 *
 * `router.refresh()` refaz a renderização inteira no servidor, e o layout do
 * app ainda busca a sessão e o estado da conexão a cada vez. Chamado a cada
 * evento, como estava, uma rajada de dez mensagens virava dez renderizações
 * completas em um segundo: a tela engasga e parece travada, exatamente quando
 * há movimento e a pessoa mais precisa dela.
 *
 * Duas travas, com papéis diferentes:
 *
 * - A espera agrupa a rajada: só recarrega depois que os eventos param.
 * - O intervalo mínimo protege do fluxo contínuo, em que a espera nunca
 *   venceria porque sempre chega um evento novo antes.
 */
const ESPERA_MS = 600;
const INTERVALO_MINIMO_MS = 4000;

export function useAtualizacaoAgrupada(pausado?: () => boolean): () => void {
  const router = useRouter();
  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);

  // Guardado em referência para a função devolvida não mudar de identidade a
  // cada render, o que refaria a assinatura de eventos sem parar.
  const estaPausado = useRef(pausado);
  estaPausado.current = pausado;

  useEffect(() => {
    return () => {
      if (agendado.current) clearTimeout(agendado.current);
    };
  }, []);

  return useCallback(() => {
    // Aba escondida não recarrega: dez abas esquecidas seriam dez
    // renderizações por evento, para ninguém ver.
    if (document.hidden || estaPausado.current?.()) return;
    if (agendado.current) clearTimeout(agendado.current);

    const desdeAUltima = Date.now() - ultima.current;
    const espera = Math.max(ESPERA_MS, INTERVALO_MINIMO_MS - desdeAUltima);

    agendado.current = setTimeout(() => {
      agendado.current = null;
      if (document.hidden || estaPausado.current?.()) return;
      ultima.current = Date.now();
      router.refresh();
    }, espera);
  }, [router]);
}
