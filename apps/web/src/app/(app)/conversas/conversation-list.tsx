"use client";

import { ATRASO_SEGUNDOS, FiltroDaCaixa, ItemDaCaixa, nomeDoLead } from "@/lib/conversas/tipos";
import { tempoRelativo } from "@/lib/relative-time";

const FILTROS: { valor: FiltroDaCaixa; rotulo: string; explicacao: string }[] = [
  { valor: "all", rotulo: "Todas", explicacao: "Todas as conversas" },
  { valor: "unread", rotulo: "Não lidas", explicacao: "Com mensagem do lead ainda sem resposta" },
  // A especificação pedia "Aguardando", mas pela definição de não lida os dois
  // filtros seriam a mesma coisa: toda não lida está aguardando. Aqui este
  // significa "espera há mais de trinta minutos", que é o ponto vermelho.
  { valor: "awaiting", rotulo: "Atrasadas", explicacao: "Sem resposta há mais de trinta minutos" },
];

/**
 * Como cada conversa se apresenta em um ponto colorido.
 *
 * A cor sozinha não carrega a informação: o texto acompanha no atributo de
 * título e na leitura de tela, porque quem não distingue verde de vermelho
 * precisa saber qual conversa está atrasada.
 */
function estado(item: ItemDaCaixa): { cor: string; descricao: string } {
  if (item.esperandoHaSegundos !== null && item.esperandoHaSegundos >= ATRASO_SEGUNDOS) {
    return { cor: "bg-red-500", descricao: "Sem resposta há mais de trinta minutos" };
  }
  if (item.awaitingReply) return { cor: "bg-amber-500", descricao: "Aguardando resposta" };
  return { cor: "bg-emerald-500", descricao: "Em dia" };
}

export function ConversationList({
  itens,
  selecionado,
  aoSelecionar,
  busca,
  aoBuscar,
  filtro,
  aoFiltrar,
  carregando,
  truncado,
}: {
  itens: ItemDaCaixa[];
  selecionado: string | null;
  aoSelecionar: (leadId: string) => void;
  busca: string;
  aoBuscar: (termo: string) => void;
  filtro: FiltroDaCaixa;
  aoFiltrar: (filtro: FiltroDaCaixa) => void;
  carregando: boolean;
  truncado: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-line/70 bg-panel">
      <div className="shrink-0 space-y-2.5 border-b border-line/60 p-3">
        <label className="relative block">
          <span className="sr-only">Buscar conversa por nome ou telefone</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={busca}
            onChange={(evento) => aoBuscar(evento.target.value)}
            placeholder="Buscar"
            className="focus-ring w-full rounded-full border border-line bg-panel-soft/60 py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-mute"
          />
        </label>

        <div className="flex gap-1 rounded-full border border-line bg-panel-soft/60 p-1">
          {FILTROS.map((opcao) => {
            const ativo = opcao.valor === filtro;
            return (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => aoFiltrar(opcao.valor)}
                aria-pressed={ativo}
                title={opcao.explicacao}
                className={`focus-ring flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] font-medium transition-all duration-200 ease-soft active:scale-95 ${
                  ativo ? "bg-ink text-canvas shadow-subtle" : "text-ink-mute hover:text-ink"
                }`}
              >
                {opcao.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {itens.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink-mute">
            {carregando ? "Carregando…" : busca ? "Nenhuma conversa com esse termo." : "Nenhuma conversa ainda."}
          </p>
        ) : (
          <ul>
            {itens.map((item) => {
              const marca = estado(item);
              const ativo = item.lead.id === selecionado;
              const naoLida = item.unreadCount > 0;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => aoSelecionar(item.lead.id)}
                    aria-current={ativo ? "true" : undefined}
                    className={`focus-ring relative flex w-full gap-2.5 border-b border-line/50 px-3.5 py-3 text-left transition-colors ${
                      ativo ? "bg-accent/[0.07]" : "hover:bg-panel-soft/70"
                    }`}
                  >
                    {/* Barra na borda esquerda: o mesmo sinal de item ativo da barra lateral. */}
                    {ativo && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-accent" />}

                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${marca.cor}`}
                      title={marca.descricao}
                      aria-hidden
                    />
                    <span className="sr-only">{marca.descricao}.</span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-[13.5px] text-ink ${naoLida ? "font-semibold" : "font-medium"}`}
                        >
                          {nomeDoLead(item.lead)}
                        </span>
                        {item.lastMessage && (
                          <span className="shrink-0 text-[11px] text-ink-mute">
                            {tempoRelativo(item.lastMessage.timestamp)}
                          </span>
                        )}
                      </span>

                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-[12px] ${naoLida ? "text-ink-soft" : "text-ink-mute"}`}>
                          {item.lastMessage?.direction === "OUTBOUND" ? "Você: " : ""}
                          {item.lastMessage?.text ?? "Sem mensagens"}
                        </span>
                        {naoLida && (
                          <span className="inline-flex min-w-[1.05rem] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-contrast">
                            {item.unreadCount > 9 ? "9+" : item.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          Dizer que a lista foi cortada. Sem isto, "não achei" e "não procurei
          além daqui" viram a mesma frase para quem lê.
        */}
        {truncado && (
          <p className="border-t border-line/50 px-4 py-3 text-[11.5px] leading-relaxed text-ink-mute">
            Mostrando as conversas mais recentes. Use a busca para encontrar uma mais antiga.
          </p>
        )}
      </div>
    </div>
  );
}
