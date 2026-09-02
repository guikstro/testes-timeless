"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { EventoDeNotificacao, Notificacao, PaginaDeNotificacoes } from "@/lib/notifications/tipos";

/** Quantos avisos o sino mostra sem abrir a página cheia. */
const NO_SINO = 12;

/**
 * Espera antes de reler a caixa depois de um evento.
 *
 * O aviso na tela sai na hora, direto do evento. A releitura serve para o
 * contador e a lista do sino ganharem o id de cada linha, e agrupá-la evita
 * uma consulta por mensagem quando chegam várias de uma vez.
 */
const ESPERA_PARA_RELER_MS = 400;

interface Contexto {
  naoLidas: number;
  recentes: Notificacao[];
  /** Falso enquanto o cano está caído; a tela mostra isso em vez de fingir que está viva. */
  conectado: boolean;
  marcarComoLida: (id: string) => Promise<void>;
  marcarTodasComoLidas: () => Promise<void>;
  /** Avisos recém-chegados que ainda estão aparecendo no canto da tela. */
  avisosNaTela: { chave: number; evento: EventoDeNotificacao }[];
  dispensarAviso: (chave: number) => void;
  /** Registra um interessado nos eventos ao vivo. Devolve como cancelar. */
  assinar: (ouvinte: (evento: EventoDeNotificacao) => void) => () => void;
}

/**
 * Exportado para permitir montar as telas com dados de exemplo, sem conexão e
 * sem sessão. É o que torna a aparência verificável em separado do transporte.
 */
export const NotificationContext = createContext<Contexto | null>(null);

export function useNotificacoes(): Contexto {
  const contexto = useContext(NotificationContext);
  if (!contexto) throw new Error("useNotificacoes precisa estar dentro de NotificationProvider.");
  return contexto;
}

/**
 * Reage a cada evento ao vivo.
 *
 * Serve para as telas que se atualizam sozinhas, como o quadro do funil. O
 * ouvinte é guardado numa referência para a assinatura não ser refeita a cada
 * render, o que reabriria a inscrição sem parar.
 */
export function useEventoDeNotificacao(ouvinte: (evento: EventoDeNotificacao) => void): void {
  const { assinar } = useNotificacoes();
  const guardado = useRef(ouvinte);
  guardado.current = ouvinte;

  useEffect(() => assinar((evento) => guardado.current(evento)), [assinar]);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [naoLidas, setNaoLidas] = useState(0);
  const [recentes, setRecentes] = useState<Notificacao[]>([]);
  const [conectado, setConectado] = useState(false);
  const [avisosNaTela, setAvisosNaTela] = useState<{ chave: number; evento: EventoDeNotificacao }[]>([]);

  const ouvintes = useRef(new Set<(evento: EventoDeNotificacao) => void>());
  const releituraAgendada = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proximaChave = useRef(0);

  const recarregar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/notifications", { cache: "no-store" });
      if (!resposta.ok) return;
      const pagina = (await resposta.json()) as PaginaDeNotificacoes;
      setRecentes(pagina.notificacoes.slice(0, NO_SINO));
      setNaoLidas(pagina.naoLidas);
    } catch {
      // Rede instável: o contador fica como está até a próxima tentativa. Um
      // número velho por alguns segundos é melhor que um zero inventado.
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const assinar = useCallback((ouvinte: (evento: EventoDeNotificacao) => void) => {
    ouvintes.current.add(ouvinte);
    return () => {
      ouvintes.current.delete(ouvinte);
    };
  }, []);

  const dispensarAviso = useCallback((chave: number) => {
    setAvisosNaTela((atuais) => atuais.filter((aviso) => aviso.chave !== chave));
  }, []);

  useEffect(() => {
    let fonte: EventSource | null = null;
    let tentativaDeVolta: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;
    let encerrado = false;

    const conectar = () => {
      if (encerrado) return;
      fonte = new EventSource("/api/notifications/stream");

      fonte.addEventListener("ready", () => {
        tentativas = 0;
        setConectado(true);
        // Uma reconexão pode ter perdido eventos enquanto estava fora. Reler a
        // caixa é o que recupera o que passou no intervalo.
        void recarregar();
      });

      fonte.onmessage = (mensagem) => {
        let evento: EventoDeNotificacao;
        try {
          evento = JSON.parse(mensagem.data) as EventoDeNotificacao;
        } catch {
          return;
        }

        setAvisosNaTela((atuais) => [...atuais, { chave: proximaChave.current++, evento }]);
        ouvintes.current.forEach((ouvinte) => ouvinte(evento));

        if (releituraAgendada.current) clearTimeout(releituraAgendada.current);
        releituraAgendada.current = setTimeout(() => void recarregar(), ESPERA_PARA_RELER_MS);
      };

      fonte.onerror = () => {
        setConectado(false);
        /*
          O navegador reconecta sozinho quando a conexão apenas cai, mas
          desiste de vez se o servidor responde com um status de erro, que é
          o caso de uma sessão expirada. Fechar e reabrir aqui é o que cobre
          esse segundo caso, com espera crescente para não martelar uma API
          que está reiniciando.
        */
        if (!fonte || fonte.readyState !== EventSource.CLOSED) return;
        fonte.close();
        fonte = null;
        tentativas += 1;
        const espera = Math.min(1000 * 2 ** (tentativas - 1), 30_000);
        tentativaDeVolta = setTimeout(conectar, espera);
      };
    };

    conectar();

    return () => {
      encerrado = true;
      if (tentativaDeVolta) clearTimeout(tentativaDeVolta);
      if (releituraAgendada.current) clearTimeout(releituraAgendada.current);
      fonte?.close();
    };
  }, [recarregar]);

  const marcarComoLida = useCallback(async (id: string) => {
    // Some da lista antes da resposta: quem clicou já sabe o que fez, e
    // esperar a rede para o número mudar faz a interface parecer travada.
    setRecentes((atuais) => atuais.map((linha) => (linha.id === id ? { ...linha, read: true } : linha)));
    setNaoLidas((atual) => Math.max(0, atual - 1));
    try {
      const resposta = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (resposta.ok) {
        const { naoLidas: total } = (await resposta.json()) as { naoLidas: number };
        setNaoLidas(total);
      }
    } catch {
      // Deixa o número otimista; a próxima releitura corrige.
    }
  }, []);

  const marcarTodasComoLidas = useCallback(async () => {
    setRecentes((atuais) => atuais.map((linha) => ({ ...linha, read: true })));
    setNaoLidas(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      // Idem.
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        naoLidas,
        recentes,
        conectado,
        marcarComoLida,
        marcarTodasComoLidas,
        avisosNaTela,
        dispensarAviso,
        assinar,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
