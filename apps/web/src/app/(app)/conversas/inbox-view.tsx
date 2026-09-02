"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEventoDeNotificacao } from "@/components/notifications/notification-provider";
import { Caixa, FichaDoLead, FiltroDaCaixa, ItemDaCaixa } from "@/lib/conversas/tipos";
import { ConversationList } from "./conversation-list";
import { InboxChat } from "./inbox-chat";
import { LeadSidePanel } from "./lead-side-panel";

/** Espera antes de buscar enquanto a pessoa ainda está digitando. */
const ESPERA_DA_BUSCA_MS = 300;

/**
 * Espera antes de reler a lista depois de um evento ao vivo.
 *
 * Agrupa rajadas: três mensagens chegando juntas releem a lista uma vez, não
 * três. O suficiente para o critério de três segundos e longe de virar uma
 * consulta por mensagem.
 */
const ESPERA_DO_EVENTO_MS = 300;

export function InboxView({
  caixaInicial,
  motivoParaNaoResponder,
  leadInicial,
}: {
  caixaInicial: Caixa;
  motivoParaNaoResponder: string | null;
  /** Veio de `?lead=` na URL, para um link de aviso abrir direto na conversa. */
  leadInicial: string | null;
}) {
  const [caixa, setCaixa] = useState<Caixa>(caixaInicial);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroDaCaixa>("all");
  const [carregandoLista, setCarregandoLista] = useState(false);

  const [selecionado, setSelecionado] = useState<string | null>(leadInicial);
  const [ficha, setFicha] = useState<FichaDoLead | null>(null);
  const [carregandoFicha, setCarregandoFicha] = useState(false);
  /*
    Aberto por padrão só onde ele é uma coluna. Abaixo de mil e vinte e quatro
    pixels o painel é uma gaveta sobre a conversa, e começar com ela aberta
    esconderia justamente o que a pessoa veio ler.

    A largura da janela não pode entrar no valor inicial: o servidor não a
    conhece, e o gabarito do grid abaixo depende dela, então o HTML do
    servidor e o do cliente sairiam diferentes. Fecha depois de montado, e
    fechar ali não muda nada na tela porque as colunas só existem a partir de
    mil e vinte e quatro pixels de qualquer forma.
  */
  const [painelAberto, setPainelAberto] = useState(true);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px)").matches) setPainelAberto(false);
  }, []);

  const releituraAgendada = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarCaixa = useCallback(
    async (termo: string, filtroAtual: FiltroDaCaixa, mostrarCarregando: boolean) => {
      if (mostrarCarregando) setCarregandoLista(true);
      try {
        const params = new URLSearchParams();
        if (termo.trim()) params.set("search", termo.trim());
        if (filtroAtual !== "all") params.set("status", filtroAtual);
        const resposta = await fetch(`/api/conversations?${params.toString()}`, { cache: "no-store" });
        if (resposta.ok) setCaixa((await resposta.json()) as Caixa);
      } catch {
        // Mantém a lista que está na tela: uma lista velha por alguns segundos
        // é melhor que uma tela vazia que sugere não haver conversa nenhuma.
      } finally {
        if (mostrarCarregando) setCarregandoLista(false);
      }
    },
    [],
  );

  // Busca e filtro: espera a pessoa parar de digitar antes de perguntar.
  const primeiraPintura = useRef(true);
  useEffect(() => {
    if (primeiraPintura.current) {
      primeiraPintura.current = false;
      return;
    }
    const relogio = setTimeout(() => void buscarCaixa(busca, filtro, true), ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(relogio);
  }, [busca, filtro, buscarCaixa]);

  const buscarFicha = useCallback(async (leadId: string, mostrarCarregando: boolean) => {
    if (mostrarCarregando) setCarregandoFicha(true);
    try {
      const resposta = await fetch(`/api/leads/${leadId}`, { cache: "no-store" });
      if (resposta.ok) setFicha((await resposta.json()) as FichaDoLead);
    } catch {
      // Idem: o que está aberto continua legível.
    } finally {
      if (mostrarCarregando) setCarregandoFicha(false);
    }
  }, []);

  useEffect(() => {
    if (!selecionado) {
      setFicha(null);
      return;
    }
    void buscarFicha(selecionado, true);
  }, [selecionado, buscarFicha]);

  const selecionar = useCallback((leadId: string) => {
    setSelecionado(leadId);
    /*
      Endereço trocado sem navegar. Uma navegação de verdade recarregaria a
      página do servidor a cada conversa aberta, refazendo a lista inteira só
      para mudar a seleção; assim o link continua compartilhável e recarregar
      a página cai na mesma conversa.
    */
    const url = new URL(window.location.href);
    url.searchParams.set("lead", leadId);
    window.history.replaceState(null, "", url);
  }, []);

  const voltarParaLista = useCallback(() => {
    setSelecionado(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("lead");
    window.history.replaceState(null, "", url);
  }, []);

  // Tempo real: a lista se reordena e a conversa aberta recebe a mensagem
  // nova sem ninguém recarregar nada.
  useEventoDeNotificacao((evento) => {
    if (releituraAgendada.current) clearTimeout(releituraAgendada.current);
    releituraAgendada.current = setTimeout(() => void buscarCaixa(busca, filtro, false), ESPERA_DO_EVENTO_MS);

    if (evento.leadId && evento.leadId === selecionado) {
      void buscarFicha(evento.leadId, false);
    }
  });

  const aoEnviar = useCallback(() => {
    if (selecionado) void buscarFicha(selecionado, false);
    void buscarCaixa(busca, filtro, false);
  }, [selecionado, busca, filtro, buscarFicha, buscarCaixa]);

  const itens: ItemDaCaixa[] = caixa.conversations;

  return (
    <div
      /*
        A caixa ocupa a janela inteira menos a faixa do sino. Rolagem acontece
        dentro de cada coluna, nunca na página: o rodapé de resposta precisa
        ficar sempre à vista.
      */
      className={`grid h-[calc(100dvh-var(--faixa-do-topo))] min-h-0 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] ${
        painelAberto ? "lg:grid-cols-[300px_minmax(0,1fr)_340px]" : "lg:grid-cols-[300px_minmax(0,1fr)]"
      }`}
    >
      {/* No telefone, lista e conversa não cabem juntas: uma dá lugar à outra. */}
      <div className={`min-h-0 ${selecionado ? "hidden md:block" : "block"}`}>
        <ConversationList
          itens={itens}
          selecionado={selecionado}
          aoSelecionar={selecionar}
          busca={busca}
          aoBuscar={setBusca}
          filtro={filtro}
          aoFiltrar={setFiltro}
          carregando={carregandoLista}
          truncado={caixa.truncado}
        />
      </div>

      <div className={`min-h-0 ${selecionado ? "block" : "hidden md:block"}`}>
        <InboxChat
          ficha={ficha}
          carregando={carregandoFicha}
          motivoParaNaoResponder={motivoParaNaoResponder}
          aoEnviar={aoEnviar}
          aoVoltar={voltarParaLista}
          painelAberto={painelAberto}
          aoAlternarPainel={() => setPainelAberto((estava) => !estava)}
        />
      </div>

      {/* Coluna de verdade só na tela larga. */}
      {ficha && painelAberto ? (
        <div className="hidden min-h-0 lg:block">
          <LeadSidePanel ficha={ficha} />
        </div>
      ) : null}

      {/* Abaixo disso o mesmo painel vira gaveta, para não espremer a conversa. */}
      {ficha && painelAberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Fechar painel do lead"
            onClick={() => setPainelAberto(false)}
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 right-0 w-[min(20rem,88vw)] animate-rise-in shadow-lifted">
            <LeadSidePanel ficha={ficha} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
