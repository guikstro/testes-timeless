"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { desconecta, entra, geraLink, LinkGerado } from "../actions";

export interface WhatsAppDoClienteDados {
  organizacao: { id: string; name: string; brandColor: string | null };
  conexao: { status: string; provider: string; numero: string | null; ultimoEventoEm: string | null } | null;
  linkExpiraEm: string | null;
}

const ROTULO: Record<string, { texto: string; cor: string }> = {
  CONNECTED: { texto: "Conectado", cor: "bg-emerald-500" },
  PENDING_QR: { texto: "Aguardando leitura do QR Code", cor: "bg-amber-500" },
  DISCONNECTED: { texto: "Desconectado", cor: "bg-ink-mute" },
};

/** Enquanto o cliente não lê o QR, a página se atualiza sozinha para mostrar a conexão assim que ela abre. */
const ATUALIZA_A_CADA_MS = 5000;

const dataHora = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function WhatsAppDoCliente({ dados }: { dados: WhatsAppDoClienteDados }) {
  const router = useRouter();
  const [link, setLink] = useState<LinkGerado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status = dados.conexao?.status ?? null;
  const conectado = status === "CONNECTED";
  const aguardando = !conectado && Boolean(dados.linkExpiraEm);

  useEffect(() => {
    if (!aguardando) return;
    const timer = setInterval(() => router.refresh(), ATUALIZA_A_CADA_MS);
    return () => clearInterval(timer);
  }, [aguardando, router]);

  const gerar = () =>
    startTransition(async () => {
      setErro(null);
      setCopiado(false);
      const resultado = await geraLink(dados.organizacao.id);
      if ("error" in resultado) setErro(resultado.error);
      else setLink(resultado);
    });

  const desconectar = () => {
    if (!window.confirm(`Desconectar o WhatsApp de ${dados.organizacao.name}? Para voltar, o cliente precisa ler um QR Code de novo.`)) return;
    startTransition(async () => {
      setErro(null);
      const resultado = await desconecta(dados.organizacao.id);
      if (resultado.error) setErro(resultado.error);
      else setLink(null);
    });
  };

  const entrar = () =>
    startTransition(async () => {
      setErro(null);
      const resultado = await entra(dados.organizacao.id);
      if (resultado?.error) setErro(resultado.error);
    });

  const copiar = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopiado(true);
  };

  const rotulo = status ? (ROTULO[status] ?? { texto: status, cor: "bg-ink-mute" }) : { texto: "Nunca conectado", cor: "bg-ink-mute" };

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-ink-mute">WhatsApp</h2>

      <p className="mt-3 flex items-center gap-2 text-ink" aria-live="polite">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${rotulo.cor}`} aria-hidden />
        {rotulo.texto}
        {dados.conexao?.numero ? <span className="text-ink-mute">· {dados.conexao.numero}</span> : null}
      </p>

      {link ? (
        <div className="mt-4 rounded-md border border-line bg-panel-soft p-3">
          <p className="text-sm text-ink-soft">Envie este link ao cliente. Vale até {dataHora(link.expiraEm)} e uma vez só.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={link.url} aria-label="Link de conexão" className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-xs" />
            <Button type="button" variant="secondary" size="sm" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      ) : dados.linkExpiraEm && !conectado ? (
        <p className="mt-4 text-sm text-ink-soft">
          Há um link ativo até {dataHora(dados.linkExpiraEm)}. Para enviar de novo, gere outro: o anterior deixa de valer.
        </p>
      ) : null}

      {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {!conectado ? (
          <Button type="button" onClick={gerar} loading={pending}>
            {dados.linkExpiraEm || link ? "Gerar novo link" : "Gerar link de conexão"}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={entrar} disabled={pending}>
          Entrar no painel do cliente
        </Button>
        {status && status !== "DISCONNECTED" ? (
          <Button type="button" variant="danger" onClick={desconectar} disabled={pending}>
            Desconectar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
