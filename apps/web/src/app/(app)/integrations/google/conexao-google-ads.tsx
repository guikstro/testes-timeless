"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BotaoCopiar } from "@/components/ui/copy-button";
import { formatCentsAsBRL } from "@/lib/currency";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { formataDia } from "@/lib/periodo";
import { desligaScriptDoGoogleAds, geraScriptDoGoogleAds } from "./script-actions";
import { Alert } from "@/components/ui/alert";
import { Foco, temPresencaLocal } from "@/lib/foco";

export interface SituacaoDoGoogleAds {
  conexao: {
    conta: string | null;
    nomeDaConta: string | null;
    moeda: string | null;
    ultimoEnvioEm: string | null;
    atrasado: boolean;
    /** O script colado é anterior às ligações e rotas. */
    scriptDesatualizado?: boolean;
    /** O script colado é anterior ao histórico: só os últimos 35 dias de cada rodada. */
    semHistorico?: boolean;
    historicoCompleto?: boolean;
    /** O primeiro dia que o script declarou ter mandado. */
    cobertoDesde?: string | null;
    /** O que cada parte nova conseguiu ler no último envio. */
    partes?: Record<string, string> | null;
  } | null;
  campanhas: {
    id: string;
    idNaPlataforma: string;
    nome: string;
    status: string;
    orcamentoDiarioCentavos: number | null;
    gastoCentavos: number;
    impressoes: number;
    cliques: number;
    conversoes: number;
    valorConversoesCentavos: number;
  }[];
}

/**
 * A ligação com o Google Ads e os números das campanhas.
 *
 * O script é o caminho porque não depende de aprovação do Google: roda dentro
 * da própria conta e manda os números para cá. A chave vai dentro dele e
 * aparece uma vez só; se a pessoa perder, gera outro, e o antigo para.
 */
export function ConexaoGoogleAds({
  situacao,
  rotuloDoPeriodo,
  foco = "LEADS",
}: {
  situacao: SituacaoDoGoogleAds;
  rotuloDoPeriodo: string;
  /** Com presença local, o script precisa mandar ligações e rotas; sem lead, não há WhatsApp a citar. */
  foco?: Foco;
}) {
  const medeLigacoes = temPresencaLocal(foco);
  const [script, setScript] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const { conexao, campanhas } = situacao;
  const recebendo = Boolean(conexao?.ultimoEnvioEm);

  function gera() {
    setErro(null);
    comecar(async () => {
      const r = await geraScriptDoGoogleAds();
      if (r.error) setErro(r.error);
      else setScript(r.script ?? null);
    });
  }

  function desliga() {
    if (!window.confirm("Desligar o Google Ads? O script para de ser aceito. O que já chegou continua aqui.")) return;
    comecar(async () => {
      const r = await desligaScriptDoGoogleAds();
      if (r.error) setErro(r.error);
      setScript(null);
    });
  }

  return (
    <section className="surface mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">Conexão com o Google Ads</h2>
          {recebendo ? (
            <p className="mt-1 text-corpo text-ink-soft">
              Conta <span className="font-medium text-ink">{conexao!.conta}</span>
              {conexao!.nomeDaConta ? ` (${conexao!.nomeDaConta})` : ""}. Último envio{" "}
              <span title={dataCompleta(conexao!.ultimoEnvioEm!)}>{tempoRelativo(conexao!.ultimoEnvioEm!)}</span>.
              {conexao!.historicoCompleto && conexao!.cobertoDesde
                ? ` Números desde ${formataDia(conexao!.cobertoDesde)}.`
                : null}
            </p>
          ) : conexao ? (
            <p className="mt-1 text-corpo text-ink-soft">
              Script gerado, esperando o primeiro envio. Depois de colar e rodar no Google Ads, os números aparecem aqui.
            </p>
          ) : (
            <p className="mt-1 text-corpo text-ink-soft">
              Um script que roda dentro da conta do Google Ads e manda o gasto e os números de cada campanha para cá, a
              cada hora. Não precisa de aprovação do Google. Só lê: não pausa nem muda nada na conta.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={conexao ? "secondary" : "primary"} loading={pendente} onClick={gera}>
            {conexao ? "Gerar script novo" : "Gerar script"}
          </Button>
          {conexao ? (
            <Button type="button" size="sm" variant="ghost" onClick={desliga} disabled={pendente}>
              Desligar
            </Button>
          ) : null}
        </div>
      </div>

      {erro ? (
        <p className="mt-3 text-apoio text-danger" role="alert">
          {erro}
        </p>
      ) : null}

      {/*
        Parado há mais de três horas: o script de hora em hora deixou de rodar,
        e os números da tabela estão velhos sem parecer.
      */}
      {conexao?.atrasado ? (
        <Alert tom="warning" className="mt-3">
          O script parou de enviar. No Google Ads, abra Ferramentas → Ações em massa → Scripts e confira se ele está
          agendado e sem erro.
        </Alert>
      ) : null}

      {/* Só para quem é medido por ligação e rota: para o cliente de leads, o script antigo basta. */}
      {medeLigacoes && conexao?.scriptDesatualizado && !script ? (
        <Alert tom="warning" className="mt-3" titulo="O script colado no Google Ads é o antigo">
          Ele manda o gasto, mas não as ligações e os pedidos de rota. Gere o script de novo aqui em cima e cole no lugar
          do atual, no Google Ads.
        </Alert>
      ) : null}

      {/*
        Para todo cliente, de leads ou de presença local: sem os meses
        anteriores, a comparação com o mês passado sai pela metade. Quem tem o
        aviso do script antigo já vai gerar o novo, que traz o histórico junto.
      */}
      {conexao?.semHistorico && !(medeLigacoes && conexao.scriptDesatualizado) && !script ? (
        <Alert tom="info" className="mt-3" titulo="Os meses anteriores ainda não chegaram">
          O script colado manda só os últimos 35 dias, e por isso o mês passado aparece pela metade nas comparações.
          Gere o script de novo aqui em cima e cole no lugar do atual: na primeira rodada ele traz os 13 meses
          anteriores, uma vez só.
        </Alert>
      ) : null}

      {medeLigacoes && conexao && !conexao.scriptDesatualizado && conexao.partes
        ? Object.entries(conexao.partes)
            .filter(([, estado]) => estado !== "ok")
            .map(([parte, estado]) => (
              <Alert key={parte} tom="info" className="mt-3" titulo={`O Google não deixou ler ${parte === "ligacoes" ? "as ligações" : "as ações locais"}`}>
                O resto chega normalmente. Motivo informado pelo Google: {estado.replace(/^falhou:\s*/, "")}
              </Alert>
            ))
        : null}

      {script ? <PassoAPasso script={script} /> : null}

      {campanhas.length > 0 ? <Tabela campanhas={campanhas} rotuloDoPeriodo={rotuloDoPeriodo} foco={foco} /> : null}
    </section>
  );
}

function PassoAPasso({ script }: { script: string }) {
  return (
    <div className="mt-5 rounded-xl border border-line/70 bg-panel-soft/40 p-4">
      <p className="text-corpo font-semibold text-ink">Cole este script no Google Ads</p>
      <p className="mt-1 text-apoio text-ink-mute">
        Ele aparece só agora: a chave dentro dele não fica guardada aqui. Se perder, gere outro.
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-apoio leading-relaxed text-ink-soft">
        <li>Abra a conta do cliente no Google Ads (a conta dele, e não a de administrador).</li>
        <li>Vá em Ferramentas → Ações em massa → Scripts e clique no botão de adicionar (+), em Novo script.</li>
        <li>Apague o que vier escrito, cole o script abaixo e dê um nome, como “Timeless”.</li>
        <li>Clique em Autorizar e aceite com a sua conta do Google.</li>
        <li>
          Clique em Visualizar para testar: no registro deve aparecer “Timeless respondeu 200”. Na primeira vez ele
          manda também os 13 meses anteriores, em várias linhas, e demora alguns minutos a mais.
        </li>
        <li>Salve, e em Frequência escolha “A cada hora”.</li>
      </ol>
      <div className="relative mt-3">
        <pre className="max-h-72 overflow-auto rounded-lg bg-ink/[0.06] p-3 pr-12 font-mono text-[11px] leading-relaxed text-ink-soft">
          {script}
        </pre>
        <BotaoCopiar texto={script} rotulo="Copiar o script" className="absolute right-2 top-2" />
      </div>
    </div>
  );
}

const STATUS: Record<string, { rotulo: string; tom: "success" | "neutral" }> = {
  ACTIVE: { rotulo: "Ativa", tom: "success" },
  PAUSED: { rotulo: "Pausada", tom: "neutral" },
  ARCHIVED: { rotulo: "Removida", tom: "neutral" },
};

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const porcento = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Tabela({
  campanhas,
  rotuloDoPeriodo,
  foco,
}: {
  campanhas: SituacaoDoGoogleAds["campanhas"];
  rotuloDoPeriodo: string;
  foco: Foco;
}) {
  const total = campanhas.reduce(
    (t, c) => ({
      gasto: t.gasto + c.gastoCentavos,
      impressoes: t.impressoes + c.impressoes,
      cliques: t.cliques + c.cliques,
      conversoes: t.conversoes + c.conversoes,
    }),
    { gasto: 0, impressoes: 0, cliques: 0, conversoes: 0 },
  );

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Campanhas, {rotuloDoPeriodo}</h3>
        <span className="text-corpo text-ink-mute">
          Gasto: <span className="font-semibold tabular-nums text-ink">{formatCentsAsBRL(total.gasto)}</span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line/70">
        <table className="w-full min-w-[52rem] text-corpo">
          <thead>
            <tr className="border-b border-line text-left text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
              <th className="px-3 py-2.5 font-semibold">Campanha</th>
              <th className="px-3 py-2.5 text-right font-semibold">Gasto</th>
              <th className="px-3 py-2.5 text-right font-semibold">Impressões</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cliques</th>
              <th className="px-3 py-2.5 text-right font-semibold">CTR</th>
              <th className="px-3 py-2.5 text-right font-semibold">Custo por clique</th>
              <th className="px-3 py-2.5 text-right font-semibold">Conversões</th>
              <th className="px-3 py-2.5 text-right font-semibold">Custo por conversão</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.map((c) => {
              const status = STATUS[c.status];
              return (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-ink">{c.nome}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-rotulo text-ink-mute">
                      {status ? (
                        <Badge tone={status.tom} dot>
                          {status.rotulo}
                        </Badge>
                      ) : null}
                      {c.orcamentoDiarioCentavos !== null ? <span>{formatCentsAsBRL(c.orcamentoDiarioCentavos)} por dia</span> : null}
                    </div>
                  </td>
                  <Celula>{formatCentsAsBRL(c.gastoCentavos)}</Celula>
                  <Celula>{inteiro(c.impressoes)}</Celula>
                  <Celula>{inteiro(c.cliques)}</Celula>
                  {/* Sem impressão ou sem clique, a conta não existe: escrito, e não um zero falso. */}
                  <Celula apagado={c.impressoes === 0}>{c.impressoes > 0 ? porcento(c.cliques / c.impressoes) : "Sem impressão"}</Celula>
                  <Celula apagado={c.cliques === 0}>{c.cliques > 0 ? formatCentsAsBRL(Math.round(c.gastoCentavos / c.cliques)) : "Sem clique"}</Celula>
                  <Celula>{c.conversoes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</Celula>
                  <Celula apagado={c.conversoes === 0}>
                    {c.conversoes > 0 ? formatCentsAsBRL(Math.round(c.gastoCentavos / c.conversoes)) : "Nenhuma"}
                  </Celula>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-apoio text-ink-mute">
        Conversões como o Google conta, com as ações configuradas na conta.{" "}
        {foco === "PRESENCA_LOCAL"
          ? "As ligações e os pedidos de rota de cada campanha aparecem em Campanhas."
          : foco === "AMBOS"
            ? "Os leads que chegam aqui pelo WhatsApp, e as ligações e rotas, aparecem em Campanhas."
            : "Os leads que chegam aqui pelo WhatsApp aparecem em Campanhas."}
      </p>
    </div>
  );
}

function Celula({ children, apagado = false }: { children: React.ReactNode; apagado?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-3 text-right align-top tabular-nums ${apagado ? "text-apoio text-ink-mute" : "text-ink"}`}>
      {children}
    </td>
  );
}
