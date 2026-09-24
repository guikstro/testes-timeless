"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { mudaRegraDeLeads, OrigemDosLeads, RegraDeLeadsState } from "./actions";

const OPCOES: { valor: OrigemDosLeads; titulo: string; descricao: string }[] = [
  {
    valor: "TRAFEGO_PAGO",
    titulo: "Só quem vem dos anúncios",
    descricao:
      "Vira lead quem clicou num anúncio pago: o da Meta que abre o WhatsApp, e o do Google pelo link rastreável. Quem escreve direto não é registrado.",
  },
  {
    valor: "RASTREADO",
    titulo: "Anúncios e links rastreáveis",
    descricao: "Também quem chega pelos links da bio do Instagram, do site ou de e-mail.",
  },
  {
    valor: "TODOS",
    titulo: "Todo mundo que escrever",
    descricao: "Qualquer conversa nova vira lead, inclusive cliente antigo, fornecedor e contato pessoal.",
  },
];

/**
 * Quem vira lead quando escreve no número conectado.
 *
 * O número do cliente recebe de tudo, e medir tráfego só pede quem chegou
 * pelo anúncio. A escolha fica à vista, com o que ela deixa de fora contado,
 * porque é ela que decide o que aparece em todas as outras telas.
 */
export function RegraDeLeads({
  atual,
  foraDaRegra,
}: {
  atual: OrigemDosLeads;
  foraDaRegra: { dias: number; mensagens: number };
}) {
  const [state, formAction, pending] = useActionState<RegraDeLeadsState, FormData>(mudaRegraDeLeads, {});
  const [escolhida, setEscolhida] = useState<OrigemDosLeads>(atual);

  return (
    <form action={formAction} className="surface p-6">
      <h2 className="text-corpo font-semibold text-ink">Quem vira lead</h2>
      <p className="mt-1 text-apoio leading-relaxed text-ink-mute">
        O número recebe todas as mensagens, e o celular continua mostrando todas. Esta regra decide só o que o sistema
        registra. Quem já é lead continua sendo acompanhado, qualquer que seja a regra.
      </p>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Quem vira lead</legend>
        {OPCOES.map((opcao) => {
          const ativa = opcao.valor === escolhida;
          return (
            <label
              key={opcao.valor}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors duration-200 ease-soft ${
                ativa ? "border-ink/40 bg-ink/[0.04]" : "border-line hover:border-ink/20"
              }`}
            >
              <input
                type="radio"
                name="origemDosLeads"
                value={opcao.valor}
                checked={ativa}
                onChange={() => setEscolhida(opcao.valor)}
                className="mt-1 h-4 w-4 shrink-0 accent-current"
              />
              <span>
                <span className="block text-corpo font-medium text-ink">{opcao.titulo}</span>
                <span className="mt-0.5 block text-apoio leading-relaxed text-ink-mute">{opcao.descricao}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {/*
        O que ficou de fora, contado: é a pergunta de quem decide se a regra
        está certa. Só o número, porque o que ficou de fora não foi guardado.
      */}
      {atual !== "TODOS" ? (
        <p className="mt-4 text-apoio leading-relaxed text-ink-mute">
          {foraDaRegra.mensagens === 0
            ? `Nos últimos ${foraDaRegra.dias} dias, nenhuma mensagem de fora da regra chegou.`
            : `Nos últimos ${foraDaRegra.dias} dias, ${foraDaRegra.mensagens} ${
                foraDaRegra.mensagens === 1 ? "mensagem de fora da regra não foi registrada" : "mensagens de fora da regra não foram registradas"
              }. Nem o conteúdo nem o número foram guardados.`}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={escolhida === atual}>
          {pending ? "Salvando..." : "Salvar regra"}
        </Button>
        {state.error ? (
          <p className="text-apoio text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : state.salvoEm && escolhida === atual ? (
          <p className="text-apoio text-emerald-700 dark:text-emerald-400" role="status">
            Regra salva. Vale para as próximas conversas.
          </p>
        ) : null}
      </div>
    </form>
  );
}
