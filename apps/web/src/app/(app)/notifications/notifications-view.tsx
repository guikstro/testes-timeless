"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Notificacao,
  PaginaDeNotificacoes,
  ROTULO_POR_TIPO,
  TipoDeNotificacao,
} from "@/lib/notifications/tipos";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { corDaNotificacao, IconeDaNotificacao } from "@/components/notifications/notification-icons";
import { useEventoDeNotificacao, useNotificacoes } from "@/components/notifications/notification-provider";
import { GrupoDePilulas } from "@/components/ui/pill-group";

const FILTROS: { rotulo: string; tipo: TipoDeNotificacao | null }[] = [
  { rotulo: "Tudo", tipo: null },
  { rotulo: "Novos leads", tipo: "lead.created" },
  { rotulo: "Qualificados", tipo: "lead.qualified" },
  { rotulo: "Vendas", tipo: "lead.won" },
  { rotulo: "Mensagens", tipo: "message.received" },
  { rotulo: "Falhas", tipo: "message.failed" },
  { rotulo: "Sistema", tipo: "sistema.erro" },
];

export function NotificationsView({
  pagina,
  tipo,
  naoLidas,
}: {
  pagina: PaginaDeNotificacoes;
  tipo: TipoDeNotificacao | null;
  naoLidas: boolean;
}) {
  const { marcarComoLida, marcarTodasComoLidas } = useNotificacoes();
  const [linhas, setLinhas] = useState<Notificacao[]>(pagina.notificacoes);
  const [cursor, setCursor] = useState<string | null>(pagina.proximoCursor);
  const [carregando, setCarregando] = useState(false);

  // A página é montada no servidor; navegar entre filtros traz dados novos e
  // o estado local precisa acompanhar, ou a lista congelaria no primeiro.
  useEffect(() => {
    setLinhas(pagina.notificacoes);
    setCursor(pagina.proximoCursor);
  }, [pagina]);

  /*
    Um aviso que chega enquanto esta tela está aberta precisa aparecer nela,
    e não só no sino. Recarregar a primeira página é mais simples que inserir
    à mão e mantém a ordem e os filtros que o servidor já aplicou.
  */
  useEventoDeNotificacao(() => {
    void recarregarPrimeiraPagina();
  });

  const busca = () => {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (naoLidas) params.set("naoLidas", "true");
    return params;
  };

  async function recarregarPrimeiraPagina() {
    try {
      const resposta = await fetch(`/api/notifications?${busca().toString()}`, { cache: "no-store" });
      if (!resposta.ok) return;
      const nova = (await resposta.json()) as PaginaDeNotificacoes;
      setLinhas(nova.notificacoes);
      setCursor(nova.proximoCursor);
    } catch {
      // Mantém o que está na tela: uma lista velha é melhor que uma vazia.
    }
  }

  async function carregarMais() {
    if (!cursor || carregando) return;
    setCarregando(true);
    try {
      const params = busca();
      params.set("antesDe", cursor);
      const resposta = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
      if (resposta.ok) {
        const proxima = (await resposta.json()) as PaginaDeNotificacoes;
        setLinhas((atuais) => [...atuais, ...proxima.notificacoes]);
        setCursor(proxima.proximoCursor);
      }
    } catch {
      // Silêncio: o botão continua lá para tentar de novo.
    } finally {
      setCarregando(false);
    }
  }

  function alternarLeitura(linha: Notificacao) {
    if (linha.read) return;
    setLinhas((atuais) => atuais.map((l) => (l.id === linha.id ? { ...l, read: true } : l)));
    void marcarComoLida(linha.id);
  }

  const href = (novoTipo: TipoDeNotificacao | null, novoNaoLidas: boolean) => {
    const params = new URLSearchParams();
    if (novoTipo) params.set("tipo", novoTipo);
    if (novoNaoLidas) params.set("naoLidas", "1");
    const query = params.toString();
    return query ? `/notifications?${query}` : "/notifications";
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Avisos</h1>
      <p className="mb-6 mt-1 text-sm text-ink-mute">
        Tudo o que aconteceu enquanto você estava em outra tela, ou fora dela.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GrupoDePilulas
          ativo={tipo ?? "todos"}
          opcoes={FILTROS.map((filtro) => ({
            chave: filtro.tipo ?? "todos",
            rotulo: filtro.rotulo,
            href: href(filtro.tipo, naoLidas),
          }))}
        />

        <Link
          href={href(tipo, !naoLidas)}
          aria-pressed={naoLidas}
          className={`focus-ring inline-flex h-8 items-center rounded-full border px-3 text-apoio font-medium transition-all duration-200 ease-soft active:scale-95 ${
            naoLidas ? "border-transparent bg-ink text-canvas" : "border-line text-ink-soft hover:text-ink"
          }`}
        >
          Só não lidos
        </Link>

        <button
          type="button"
          onClick={() => {
            setLinhas((atuais) => atuais.map((l) => ({ ...l, read: true })));
            void marcarTodasComoLidas();
          }}
          className="focus-ring inline-flex h-8 items-center rounded-full px-3 text-apoio font-medium text-ink-soft transition-all duration-200 ease-soft hover:bg-ink/[0.06] hover:text-ink active:scale-95"
        >
          Marcar todos como lidos
        </button>
      </div>

      {linhas.length === 0 ? (
        <div className="surface p-10 text-center">
          <p className="text-sm text-ink-soft">Nada por aqui.</p>
          <p className="mt-1.5 text-apoio text-ink-mute">
            Avisos aparecem quando um lead chega, avança no funil ou uma mensagem não sai.
          </p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          {linhas.map((linha) => {
            const conteudo = (
              <>
                <span className={`mt-0.5 shrink-0 ${corDaNotificacao(linha.type)}`}>
                  <IconeDaNotificacao tipo={linha.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-corpo font-medium text-ink">{linha.title}</span>
                    <span className="shrink-0 text-rotulo text-ink-mute" title={dataCompleta(linha.createdAt)}>
                      {tempoRelativo(linha.createdAt)}
                    </span>
                  </span>
                  {linha.body ? (
                    <span className="mt-0.5 block text-apoio leading-relaxed text-ink-soft">{linha.body}</span>
                  ) : null}
                  <span className="mt-1 block text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                    {ROTULO_POR_TIPO[linha.type]}
                  </span>
                </span>
                {!linha.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </>
            );

            const classe = `flex w-full gap-3 border-b border-line/60 px-4 py-3.5 text-left transition-colors last:border-0 ${
              linha.read ? "opacity-65" : ""
            } hover:bg-panel-soft`;

            return linha.leadId ? (
              <Link
                key={linha.id}
                href={`/leads/${linha.leadId}`}
                onClick={() => alternarLeitura(linha)}
                className={`focus-ring ${classe}`}
              >
                {conteudo}
              </Link>
            ) : (
              <button key={linha.id} type="button" onClick={() => alternarLeitura(linha)} className={`focus-ring ${classe}`}>
                {conteudo}
              </button>
            );
          })}
        </div>
      )}

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void carregarMais()}
            disabled={carregando}
            className="focus-ring inline-flex h-9 items-center rounded-full border border-line bg-panel px-4 text-corpo font-medium text-ink shadow-subtle transition-all duration-200 ease-soft hover:shadow-card active:scale-95 disabled:opacity-50"
          >
            {carregando ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}
    </div>
  );
}
