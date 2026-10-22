"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { EstadoDoRelatorioSemanal, salvarRelatorioSemanal } from "./relatorio-semanal-actions";

const inicial: EstadoDoRelatorioSemanal = {};

/** Liga o resumo que chega toda segunda: no sino, no celular e por e-mail aos donos da conta. */
export function RelatorioSemanalForm({ ligado: ligadoInicial }: { ligado: boolean }) {
  const [estado, acao, salvando] = useActionState(salvarRelatorioSemanal, inicial);
  const [ligado, setLigado] = useState(ligadoInicial);

  return (
    <form action={acao} className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="relatorioSemanal"
          checked={ligado}
          onChange={(evento) => setLigado(evento.target.checked)}
          className="focus-ring mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[rgb(var(--accent))]"
        />
        <span>
          <span className="block text-corpo font-medium text-ink">Mandar o resumo da semana</span>
          <span className="mt-0.5 block text-apoio text-ink-mute">
            {ligado
              ? "Toda segunda às 8h: contatos, clientes, quanto foi investido e a campanha que mais trouxe. Chega no sino, no celular de quem ativou os avisos e no e-mail dos donos da conta."
              : "Desligado. Ligue para receber toda segunda às 8h os números da semana, sem precisar abrir o sistema."}
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
