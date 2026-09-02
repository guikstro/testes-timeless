"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * O miolo das telas.
 *
 * Quase toda tela quer respiro em volta, e é por isso que o espaçamento mora
 * aqui em vez de repetido em cada página. A caixa de entrada é a exceção: ela
 * é um painel de três colunas que vai de borda a borda, e uma margem em volta
 * roubaria justamente o espaço da conversa.
 *
 * Precisa ser componente de cliente porque só o cliente conhece a rota atual;
 * um layout do servidor não recebe o caminho.
 */
const SEM_ESPACAMENTO = ["/conversas"];

export function AppMain({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const inteira = SEM_ESPACAMENTO.some((rota) => caminho.startsWith(rota));

  return (
    <div className={inteira ? "animate-rise-in" : "animate-rise-in p-6 sm:p-8"}>{children}</div>
  );
}
