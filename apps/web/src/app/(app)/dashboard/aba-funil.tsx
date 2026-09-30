import { EmptyState } from "@/components/ui/skeleton";
import { EtapaDoFunil, FunilSimples, porCento } from "./funil-simples";
import { FiltrosDoFunil } from "./filtros-do-funil";
import { maiorPerda } from "./conclusao";
import type { ChaveDaEtapa, FunilDoPeriodo } from "./tipos";

/**
 * Como cada etapa aparece. `chegada` é o que fez quem passou da etapa
 * anterior para esta, e vira a frase entre as barras.
 *
 * "Reunião marcada" e não "Negociação": é o nome do estágio no quadro de
 * leads, e o funil precisa falar a mesma língua da tela onde o lead é movido.
 */
const ETAPAS: Record<ChaveDaEtapa, { rotulo: string; chegada?: string }> = {
  leads: { rotulo: "Leads" },
  contatados: { rotulo: "Contatados", chegada: "foram contatados" },
  qualificados: { rotulo: "Qualificados", chegada: "foram qualificados" },
  reuniao: { rotulo: "Reunião marcada", chegada: "marcaram reunião" },
  vendas: { rotulo: "Vendas", chegada: "compraram" },
};

/**
 * Onde as pessoas somem.
 *
 * Cada barra conta quem chegou naquela etapa ou foi além, então uma venda
 * aparece em todas as de cima. Entre as barras, a conversão da passagem e
 * quem ficou para trás, separado entre em aberto e perdido: são problemas
 * diferentes, e pedem ações diferentes.
 */
export function AbaFunil({ dados }: { dados: FunilDoPeriodo }) {
  const { funil, filtros, opcoes, totalNoPeriodo } = dados;
  const entraram = funil.etapas[0]?.quantidade ?? 0;
  const vendas = funil.etapas[funil.etapas.length - 1]?.quantidade ?? 0;
  const recortado = Boolean(filtros.campanha || filtros.origem || filtros.responsavel);
  const pior = maiorPerda(funil.etapas);
  const saida = pior ? funil.etapas.find((etapa) => etapa.chave === pior.de) : undefined;

  const etapas: EtapaDoFunil[] = funil.etapas.map((etapa) => ({
    chave: etapa.chave,
    rotulo: ETAPAS[etapa.chave].rotulo,
    valor: etapa.quantidade,
    chegada: ETAPAS[etapa.chave].chegada,
    parados: { abertos: etapa.abertos, perdidos: etapa.perdidos },
  }));

  const maiorMotivo = Math.max(1, ...funil.motivosDePerda.map((motivo) => motivo.quantidade));

  return (
    <div className="space-y-5">
      <FiltrosDoFunil
        // A chave troca quando o servidor devolve outros filtros, e o
        // componente recomeça do que a página nova diz.
        key={`${filtros.campanha}|${filtros.origem}|${filtros.responsavel}`}
        filtros={filtros}
        opcoes={opcoes}
        totalNoPeriodo={totalNoPeriodo}
        noRecorte={entraram}
      />

      <section className="surface p-6 sm:p-8">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Para onde os leads vão</h2>
        <p className="mb-6 mt-0.5 text-apoio text-ink-mute">
          Cada barra conta quem chegou naquela etapa ou foi além. Entre elas, quantos passaram e quem ficou.
        </p>

        {entraram > 0 ? (
          <>
            <FunilSimples etapas={etapas} />

            {/* A conclusão escrita, para não depender de medir a faixa com o olho. */}
            {pior && saida ? (
              <p className="mt-6 border-t border-line/60 pt-5 text-corpo leading-relaxed text-ink-soft">
                A maior perda está entre{" "}
                <span className="font-semibold text-ink">{ETAPAS[pior.de].rotulo.toLowerCase()}</span> e{" "}
                <span className="font-semibold text-ink">{ETAPAS[pior.para].rotulo.toLowerCase()}</span>:{" "}
                <span className="font-semibold tabular-nums text-ink">
                  {pior.perdeu.toLocaleString("pt-BR")} de {saida.quantidade.toLocaleString("pt-BR")}
                </span>{" "}
                não passaram ({porCento(pior.proporcao)}).
              </p>
            ) : null}
          </>
        ) : recortado ? (
          <EmptyState
            title="Nenhum lead com estes filtros"
            description="Troque ou limpe os filtros acima para ver os outros leads do período."
          />
        ) : (
          <EmptyState
            title="Ainda não há funil para mostrar"
            description="Ele aparece quando o primeiro lead chegar e começar a andar entre as etapas."
          />
        )}
      </section>

      {entraram > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Resumo
            rotulo="Conversão total"
            valor={funil.conversaoTotal === null ? "Sem base" : porCento(funil.conversaoTotal)}
            nota={`${vendas.toLocaleString("pt-BR")} de ${entraram.toLocaleString("pt-BR")} ${entraram === 1 ? "lead virou" : "leads viraram"} venda`}
          />
          <Resumo
            rotulo="Em aberto"
            valor={funil.abertos.toLocaleString("pt-BR")}
            nota="ainda podem avançar no funil"
          />
          <Resumo
            rotulo="Perdidos"
            valor={funil.perdidos.toLocaleString("pt-BR")}
            nota={
              funil.perdidos > 0 ? `${porCento(funil.perdidos / entraram)} dos leads` : "nenhum marcado como perdido"
            }
          />
        </div>
      ) : null}

      {funil.motivosDePerda.length > 0 ? (
        <section className="surface p-6">
          <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Por que foram perdidos</h2>
          <p className="mb-5 mt-0.5 text-apoio text-ink-mute">O motivo escolhido ao marcar o lead como perdido.</p>

          <ul className="space-y-3">
            {funil.motivosDePerda.map((motivo) => (
              <li key={motivo.motivo ?? ""}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className={`text-corpo ${motivo.motivo === null ? "text-ink-mute" : "text-ink"}`}>
                    {motivo.motivo ?? "Sem motivo informado"}
                  </p>
                  <p className="shrink-0 text-corpo font-semibold tabular-nums text-ink">
                    {motivo.quantidade.toLocaleString("pt-BR")}
                    <span className="ml-1.5 font-normal text-ink-mute">
                      ({porCento(motivo.quantidade / funil.perdidos)})
                    </span>
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-soft">
                  <div
                    className="h-full rounded-full bg-ink-mute/50"
                    style={{ width: `${(motivo.quantidade / maiorMotivo) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Resumo({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="surface p-4">
      <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">{rotulo}</p>
      <p className="mt-1.5 font-display text-xl font-semibold tabular-nums text-ink">{valor}</p>
      <p className="mt-1 text-rotulo text-ink-mute">{nota}</p>
    </div>
  );
}
