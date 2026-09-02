"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEventoDeNotificacao, useNotificacoes } from "./notification-provider";

/**
 * Faz a tela buscar os dados de novo quando algo acontece.
 *
 * Recarrega a rota inteira em vez de mexer nos números na mão. Somar um ao
 * contador aqui exigiria repetir, do lado do cliente, todas as regras que o
 * servidor já aplica: o que conta como lead qualificado, o que entra na
 * janela do período, o que é receita. Duas cópias dessas regras divergiriam,
 * e a tela passaria a mostrar um número que o servidor não confirma.
 */
const INTERVALO_DE_RESERVA = 30_000;

export function AtualizaAoVivo() {
  const router = useRouter();
  const { conectado } = useNotificacoes();

  const atualizar = useCallback(() => {
    if (document.hidden) return;
    router.refresh();
  }, [router]);

  useEventoDeNotificacao(atualizar);

  useEffect(() => {
    function aoVoltar() {
      if (!document.hidden) atualizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [atualizar]);

  // Rede de segurança para quando o cano está fora: sem ela, uma queda de
  // conexão deixaria a tela parada sem ninguém perceber.
  useEffect(() => {
    if (conectado) return;
    const relogio = window.setInterval(atualizar, INTERVALO_DE_RESERVA);
    return () => window.clearInterval(relogio);
  }, [conectado, atualizar]);

  return null;
}
