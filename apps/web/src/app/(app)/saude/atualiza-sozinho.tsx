"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Busca os números de novo a cada meio minuto, e ao voltar para a aba. Quem
 * acompanha um incidente deixa esta tela aberta, e ela não pode ficar velha.
 */
export function AtualizaSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, segundos * 1000);
    const aoVoltar = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, segundos]);
  return null;
}
