"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import type { FunilDoPeriodo } from "./tipos";

type Recorte = keyof FunilDoPeriodo["filtros"];

const RECORTES: Recorte[] = ["campanha", "origem", "responsavel"];

/**
 * Os recortes do funil: campanha, origem e responsável.
 *
 * O estado vive na URL, como nos filtros da lista de leads: o recorte volta
 * certo ao recarregar, vai junto num link e respeita o botão de voltar. O
 * período continua no seletor do cabeçalho, que é o mesmo para todas as abas.
 */
export function FiltrosDoFunil({
  filtros,
  opcoes,
  totalNoPeriodo,
  noRecorte,
}: {
  filtros: FunilDoPeriodo["filtros"];
  opcoes: FunilDoPeriodo["opcoes"];
  totalNoPeriodo: number;
  /** Leads que sobram depois dos recortes. */
  noRecorte: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  // A escolha fica aqui até a página nova chegar. Presos só à resposta do
  // servidor, os campos voltariam ao valor antigo durante a espera e
  // pareceriam ter ignorado o clique. Quem monta este componente troca a
  // chave dele quando os filtros mudam, e o estado recomeça do servidor.
  const [escolhidos, setEscolhidos] = useState(filtros);

  function navega(novos: FunilDoPeriodo["filtros"]) {
    setEscolhidos(novos);
    const busca = new URLSearchParams(params.toString());
    for (const recorte of RECORTES) {
      const valor = novos[recorte];
      if (valor) busca.set(recorte, valor);
      else busca.delete(recorte);
    }
    iniciar(() => router.replace(`${pathname}?${busca.toString()}`, { scroll: false }));
  }

  const recortado = RECORTES.some((recorte) => escolhidos[recorte] !== null);
  const responsavelDesconhecido =
    escolhidos.responsavel !== null &&
    escolhidos.responsavel !== "eu" &&
    escolhidos.responsavel !== "nenhum" &&
    !opcoes.responsaveis.some((pessoa) => pessoa.id === escolhidos.responsavel);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Campanha"
        value={escolhidos.campanha ?? ""}
        onChange={(evento) => navega({ ...escolhidos, campanha: evento.target.value || null })}
        envolucro="w-full sm:inline-block sm:w-auto"
        className="h-9 sm:w-auto sm:max-w-[16rem]"
      >
        <option value="">Todas as campanhas</option>
        {opcoes.campanhas.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo} ({opcao.leads})
          </option>
        ))}
      </Select>

      <Select
        aria-label="Origem"
        value={escolhidos.origem ?? ""}
        onChange={(evento) => navega({ ...escolhidos, origem: evento.target.value || null })}
        envolucro="w-full sm:inline-block sm:w-auto"
        className="h-9 sm:w-auto sm:max-w-[16rem]"
      >
        <option value="">Todas as origens</option>
        {opcoes.origens.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo} ({opcao.leads})
          </option>
        ))}
      </Select>

      <Select
        aria-label="Responsável"
        value={escolhidos.responsavel ?? ""}
        onChange={(evento) => navega({ ...escolhidos, responsavel: evento.target.value || null })}
        envolucro="w-full sm:inline-block sm:w-auto"
        className="h-9 sm:w-auto sm:max-w-[16rem]"
      >
        <option value="">Todos os responsáveis</option>
        <option value="eu">Meus leads</option>
        <option value="nenhum">Sem responsável</option>
        {opcoes.responsaveis.map((pessoa) => (
          <option key={pessoa.id} value={pessoa.id}>
            {pessoa.name}
          </option>
        ))}
        {/* Um link antigo com alguém que saiu da conta: o funil continua
            recortado por essa pessoa, e o campo precisa dizer isso. */}
        {responsavelDesconhecido ? <option value={escolhidos.responsavel ?? ""}>Pessoa que saiu da conta</option> : null}
      </Select>

      {recortado ? (
        <button
          type="button"
          onClick={() => navega({ campanha: null, origem: null, responsavel: null })}
          className="focus-ring rounded-lg px-2 py-1.5 text-apoio font-medium text-ink-soft underline underline-offset-2 transition-colors duration-200 ease-soft hover:text-ink"
        >
          Limpar filtros
        </button>
      ) : null}

      <span className="ml-auto text-apoio tabular-nums text-ink-mute" aria-live="polite">
        {pendente
          ? "Atualizando…"
          : recortado
            ? `${noRecorte.toLocaleString("pt-BR")} de ${totalNoPeriodo.toLocaleString("pt-BR")} leads do período`
            : `${totalNoPeriodo.toLocaleString("pt-BR")} ${totalNoPeriodo === 1 ? "lead" : "leads"} no período`}
      </span>
    </div>
  );
}
