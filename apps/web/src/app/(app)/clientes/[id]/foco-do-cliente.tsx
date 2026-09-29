"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { useToast } from "@/components/ui/toast";
import type { Foco } from "@/lib/foco";
import { mudaFoco } from "../actions";

const OPCOES: { valor: Foco; rotulo: string; descricao: string }[] = [
  {
    valor: "LEADS",
    rotulo: "Leads",
    descricao: "WhatsApp, conversas, leads e vendas. Para quem vende pelo atendimento.",
  },
  {
    valor: "PRESENCA_LOCAL",
    rotulo: "Presença local",
    descricao: "Ligações, pedidos de rota e visitas vindos do Google. Some o que é de lead e de WhatsApp.",
  },
  {
    valor: "AMBOS",
    rotulo: "Os dois",
    descricao: "Tudo de leads, e a presença local como mais uma aba no dashboard e em Campanhas.",
  },
];

/**
 * O que importa para este cliente. Vale na hora para todos que usam a conta
 * dele; os dados não mudam, só o que aparece.
 */
export function FocoDoCliente({ organizationId, foco }: { organizationId: string; foco: Foco }) {
  const [atual, setAtual] = useState<Foco>(foco);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const { avisa } = useToast();

  function escolhe(novo: Foco) {
    const antes = atual;
    setAtual(novo);
    setErro(null);
    iniciar(async () => {
      const resultado = await mudaFoco(organizationId, novo);
      if (resultado.erro) {
        setAtual(antes);
        setErro(resultado.erro);
        return;
      }
      avisa(`Foco mudado para ${OPCOES.find((o) => o.valor === novo)?.rotulo.toLowerCase()}`);
    });
  }

  return (
    <Card className="mt-6 p-6">
      <CardHeader
        title="Foco do cliente"
        description="Decide o menu, o dashboard e o relatório que o cliente vê."
        className="mb-4"
      />
      <RadioGroup legenda={<span className="sr-only">Foco</span>}>
        {OPCOES.map((opcao) => (
          <Radio
            key={opcao.valor}
            name="foco"
            value={opcao.valor}
            checked={atual === opcao.valor}
            disabled={pendente}
            onChange={() => escolhe(opcao.valor)}
            descricao={opcao.descricao}
          >
            {opcao.rotulo}
          </Radio>
        ))}
      </RadioGroup>
      {erro ? (
        <p role="alert" className="mt-3 text-apoio text-danger">
          {erro}
        </p>
      ) : null}
    </Card>
  );
}
