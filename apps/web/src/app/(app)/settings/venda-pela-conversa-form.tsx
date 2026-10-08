"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { EstadoDaVendaPelaConversa, salvarVendaPelaConversa } from "./venda-pela-conversa-actions";

const inicial: EstadoDaVendaPelaConversa = {};

/**
 * Se a frase de venda confirma a venda sozinha ou só a põe na fila de
 * revisão. Ligado, é o comportamento de sempre: venda confirmada, lead em
 * Ganho e Purchase para a Meta quando há valor. Desligado, alguém confirma em
 * Vendas, e só então a receita entra nos números.
 */
export function VendaPelaConversaForm({ confirma: confirmaInicial }: { confirma: boolean }) {
  const [estado, acao, salvando] = useActionState(salvarVendaPelaConversa, inicial);
  const [confirma, setConfirma] = useState(confirmaInicial);

  return (
    <form action={acao} className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="confirmaVendaDaConversa"
          checked={confirma}
          onChange={(evento) => setConfirma(evento.target.checked)}
          className="focus-ring mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[rgb(var(--accent))]"
        />
        <span>
          <span className="block text-corpo font-medium text-ink">Confirmar a venda pela frase da conversa</span>
          <span className="mt-0.5 block text-apoio text-ink-mute">
            {confirma
              ? "A frase de venda confirma a venda, leva o lead a Ganho e, com valor, avisa a Meta. Frases com dúvida ou condição ficam para revisão em Vendas."
              : "Toda venda detectada na conversa espera alguém confirmar em Vendas. Até lá, ela fica fora da receita e a Meta não é avisada."}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={salvando}>
          Salvar
        </Button>
        {estado.erro ? (
          <span role="alert" className="text-apoio text-danger">
            {estado.erro}
          </span>
        ) : estado.salvoEm ? (
          <span role="status" className="text-apoio text-ink-mute">
            Salvo.
          </span>
        ) : null}
      </div>
    </form>
  );
}
