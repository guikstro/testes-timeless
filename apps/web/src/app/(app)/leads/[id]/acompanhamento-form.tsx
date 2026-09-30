"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date";
import { Field, Input, Select } from "@/components/ui/input";
import { Responsavel, textoDosCentavos } from "@/lib/leads/acompanhamento";
import { AcompanhamentoState, salvaAcompanhamento } from "./actions";

const inicial: AcompanhamentoState = {};

/**
 * Quem cuida do lead e o que vem a seguir.
 *
 * Um formulário só, salvo de uma vez: são quatro campos que se leem juntos
 * ("a Ana liga na quinta para fechar"), e salvar um por um obrigaria a
 * pessoa a lembrar de clicar quatro vezes.
 */
export function AcompanhamentoForm({
  leadId,
  responsavelId,
  pessoas,
  valorPotencialCentavos,
  proximaAcao,
  proximaAcaoEm,
}: {
  leadId: string;
  responsavelId: string | null;
  pessoas: Responsavel[];
  valorPotencialCentavos: number | null;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
}) {
  const acao = salvaAcompanhamento.bind(null, leadId);
  const [estado, formAction, pendente] = useActionState(acao, inicial);
  const [responsavel, setResponsavel] = useState(responsavelId ?? "");

  return (
    <form
      /*
        Enviado à mão, e não pelo `action` do formulário: com o `action`, o
        React 19 limpa os campos depois de salvar, e o seletor voltava à opção
        de quando a tela abriu, mostrando "Sem responsável" para um lead que
        acabou de ganhar um. Assim os campos ficam como a pessoa deixou, que é
        o que foi salvo.
      */
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => formAction(dados));
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Responsável">
        {(id, ligacao) => (
          <Select
            id={id}
            name="responsavelId"
            value={responsavel}
            onChange={(evento) => setResponsavel(evento.target.value)}
            {...ligacao}
          >
            <option value="">Sem responsável</option>
            {pessoas.map((pessoa) => (
              <option key={pessoa.id} value={pessoa.id}>
                {pessoa.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Valor potencial" hint="Quanto este lead pode valer, em reais.">
        {(id, ligacao) => (
          <Input
            id={id}
            name="valorPotencial"
            inputMode="decimal"
            placeholder="1.500,00"
            defaultValue={textoDosCentavos(valorPotencialCentavos)}
            {...ligacao}
          />
        )}
      </Field>

      <Field label="Próxima ação">
        {(id, ligacao) => (
          <Input
            id={id}
            name="proximaAcao"
            maxLength={200}
            placeholder="Ligar para fechar"
            defaultValue={proximaAcao ?? ""}
            {...ligacao}
          />
        )}
      </Field>

      <Field label="Quando">
        {(id, ligacao) => (
          <DatePicker id={id} name="proximaAcaoEm" defaultValue={proximaAcaoEm?.slice(0, 10) ?? ""} {...ligacao} />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={pendente}>
          Salvar acompanhamento
        </Button>
        {estado.salvoEm && !estado.error ? (
          <p role="status" className="text-apoio text-success">
            Salvo.
          </p>
        ) : null}
      </div>
      {estado.error ? (
        <p role="alert" className="text-apoio text-danger">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}
