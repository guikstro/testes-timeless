"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Entra no cliente, que agora fica noutro endereço.
 *
 * O caminho mudou de forma: em vez de trocar a sessão desta aba, esta ação
 * pede um código de uso único e manda o navegador para o site do cliente com
 * ele. A sessão do operador continua aqui, intacta — voltar é fechar aquela
 * aba, não restaurar nada.
 *
 * O código nunca passa por este componente: o route handler o transforma em
 * endereço completo e devolve só para onde ir.
 */
export function EnterClientButton({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setErro(null);
    setEntrando(true);

    try {
      const resposta = await fetch("/api/entrada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      if (!resposta.ok) {
        const body = await resposta.json().catch(() => null);
        setErro(body?.message ?? "Não foi possível entrar neste cliente.");
        return;
      }

      const { destino } = await resposta.json();

      /*
        Aba nova, e não esta.

        Sai mais caro em cliques e compra uma coisa que vale mais: a
        administração continua aberta atrás. Antes, entrar num cliente
        substituía a tela onde o operador estava, e voltar dependia de um
        botão que restaurava cookies. Agora as duas sessões coexistem em abas
        diferentes, cada uma no seu endereço, e nenhuma pode ser confundida
        com a outra.
      */
      window.open(destino, "_blank", "noopener,noreferrer");
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="text-right">
      <Button onClick={() => void entrar()} loading={entrando} size="sm" title={`Entrar em ${organizationName}`}>
        {entrando ? "Abrindo" : "Entrar"}
      </Button>
      {erro ? <p className="mt-1 text-rotulo text-red-400">{erro}</p> : null}
    </div>
  );
}
