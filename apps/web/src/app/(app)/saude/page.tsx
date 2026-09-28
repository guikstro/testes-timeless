import { ReactNode } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/state";
import { tempoRelativo, dataCompleta } from "@/lib/relative-time";
import { AtualizaSozinho } from "./atualiza-sozinho";
import { ResolverErro } from "./resolver-erro";

export const metadata = { title: "Saúde da plataforma" };

type Parte<T> = T | { erro: string };
const falhou = <T,>(parte: Parte<T>): parte is { erro: string } =>
  typeof parte === "object" && parte !== null && "erro" in parte && typeof (parte as { erro: unknown }).erro === "string";

interface Problema {
  cliente: string;
  situacao?: string;
  evento?: string;
  erro?: string | null;
  desde?: string;
  quando?: string;
  ultimaSincroniaEm?: string | null;
  ultimoEnvioEm?: string | null;
}

interface Fila {
  nome: string;
  trabalhadores: number;
  esperando: number;
  emExecucao: number;
  agendados: number;
  falhos: number;
  ultimasFalhas: { trabalho: string; motivo: string; quando: string | null; tentativas: number }[];
}

interface Saude {
  geradoEm: string;
  api: { commit: string | null; iniciadaEm: string; node: string; memoriaMb: { total: number; heap: number } };
  banco: Parte<{ ok: true; ms: number }>;
  redis: Parte<{ ok: true; ms: number }>;
  requisicoes: { pedidos: number; erros: number; taxaDeErro: number | null; p50Ms: number | null; p95Ms: number | null };
  filas: Parte<Fila[]>;
  integracoes: {
    whatsapp: Parte<{ total: number; conectados: number; ultimoEventoEm: string | null; problemas: Problema[] }>;
    meta: Parte<{ total: number; sincronizando: number; ultimaSincroniaEm: string | null; problemas: Problema[] }>;
    google: Parte<{ total: number; problemas: Problema[] }>;
    capi: Parte<{ ultimas24h: { enviados: number; tentando: number; falhos: number }; ultimasFalhas: Problema[] }>;
  };
  erros: Parte<{ abertos: number; ultimas24h: number }>;
}

interface ErroDaPlataforma {
  id: string;
  origem: string;
  tipo: string;
  mensagem: string;
  contexto: { caminho?: string } | null;
  ocorrencias: number;
  primeiraEm: string;
  ultimaEm: string;
}

/** Acima disso, num plano de 512 MB, o processo está perto de ser reiniciado por falta de memória. */
const MEMORIA_ALTA_MB = 400;

const NOME_DA_FILA: Record<string, string> = {
  "whatsapp-events": "Mensagens recebidas",
  "whatsapp-send": "Mensagens enviadas",
  "meta-sync": "Sincronia com a Meta",
  "meta-conversions": "API de Conversões",
  email: "E-mails",
  manutencao: "Manutenção",
};

/**
 * A saúde da plataforma, para a equipe Timeless: se algo está quebrado, onde e
 * desde quando, sem precisar abrir log. Atualiza sozinha a cada meio minuto.
 */
export default async function SaudePage() {
  let saude: Saude;
  let erros: ErroDaPlataforma[];
  try {
    [saude, erros] = await Promise.all([apiFetch<Saude>("/admin/saude"), apiFetch<ErroDaPlataforma[]>("/admin/erros")]);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return (
        <div className="max-w-lg">
          <h1 className="mb-3 font-display text-2xl font-semibold tracking-tight text-ink">Saúde da plataforma</h1>
          <Alert tom="warning">{error.body.message}</Alert>
        </div>
      );
    }
    throw error;
  }

  const { requisicoes, api, integracoes } = saude;
  const memoriaAlta = api.memoriaMb.total > MEMORIA_ALTA_MB;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AtualizaSozinho />
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Saúde da plataforma</h1>
        <p className="mt-1 text-corpo text-ink-mute">
          Atualizada {tempoRelativo(saude.geradoEm)}. Versão {api.commit ? api.commit.slice(0, 7) : "local"}, no ar desde{" "}
          {dataCompleta(api.iniciadaEm)}.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="API" ok={!memoriaAlta} valor={`${api.memoriaMb.total} MB`} nota={memoriaAlta ? "Memória alta" : "de memória em uso"} />
        <Indicador
          titulo="Banco"
          ok={!falhou(saude.banco)}
          valor={falhou(saude.banco) ? "Fora" : `${saude.banco.ms} ms`}
          nota={falhou(saude.banco) ? saude.banco.erro : "para responder"}
        />
        <Indicador
          titulo="Redis"
          ok={!falhou(saude.redis)}
          valor={falhou(saude.redis) ? "Fora" : `${saude.redis.ms} ms`}
          nota={falhou(saude.redis) ? saude.redis.erro : "filas e sessões"}
        />
        <Indicador
          titulo="Pedidos na última hora"
          ok={(requisicoes.taxaDeErro ?? 0) < 0.01}
          valor={String(requisicoes.pedidos)}
          nota={
            requisicoes.pedidos
              ? `${formataPorcento(requisicoes.taxaDeErro)} com erro · metade em até ${requisicoes.p50Ms} ms · 95% em até ${requisicoes.p95Ms} ms`
              : "Nenhum pedido desde a última publicação"
          }
        />
      </div>

      <Card className="p-6">
        <CardHeader
          title="Erros"
          description="Agrupados: a mesma falha repetida é uma linha só. Marcar como resolvido tira da lista; se voltar, ela reabre."
          className="mb-4"
        />
        {erros.length === 0 ? (
          <EmptyState title="Nenhum erro aberto" description="Quando algo quebrar na API ou numa tela, aparece aqui." />
        ) : (
          <ul className="divide-y divide-line/60">
            {erros.map((erro) => (
              <li key={erro.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-corpo text-ink">{erro.mensagem}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-apoio text-ink-mute">
                    <Badge tone={erro.origem === "navegador" ? "info" : "danger"}>
                      {erro.origem === "navegador" ? "Tela" : "API"}
                    </Badge>
                    <span>
                      {erro.ocorrencias} {erro.ocorrencias === 1 ? "vez" : "vezes"} · última {tempoRelativo(erro.ultimaEm)} ·
                      primeira {tempoRelativo(erro.primeiraEm)}
                    </span>
                    {erro.contexto?.caminho ? <code className="text-rotulo">{erro.contexto.caminho}</code> : null}
                  </p>
                </div>
                <ResolverErro id={erro.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <CardHeader title="Filas" description="O trabalho que roda por trás: mensagens, sincronias, conversões e e-mails." className="mb-4" />
        {falhou(saude.filas) ? (
          <Alert tom="danger" titulo="Não deu para ler as filas">
            {saude.filas.erro}
          </Alert>
        ) : (
          <>
            <DataTable
              legenda="Filas de trabalho"
              linhas={saude.filas}
              chaveDaLinha={(f) => f.nome}
              colunas={[
                { chave: "nome", titulo: "Fila", principal: true, celula: (f) => NOME_DA_FILA[f.nome] ?? f.nome },
                {
                  chave: "trab",
                  titulo: "Trabalhadores",
                  alinhar: "direita",
                  celula: (f) => (f.trabalhadores === 0 ? <Badge tone="danger">Nenhum</Badge> : f.trabalhadores),
                },
                { chave: "esp", titulo: "Esperando", alinhar: "direita", celula: (f) => f.esperando },
                { chave: "exe", titulo: "Rodando", alinhar: "direita", celula: (f) => f.emExecucao },
                { chave: "age", titulo: "Agendados", alinhar: "direita", celula: (f) => f.agendados },
                {
                  chave: "fal",
                  titulo: "Falhos",
                  alinhar: "direita",
                  celula: (f) => (f.falhos > 0 ? <span className="text-danger">{f.falhos}</span> : 0),
                },
              ]}
            />
            {saude.filas.some((f) => f.ultimasFalhas.length > 0) ? (
              <div className="mt-5 space-y-2">
                <p className="text-rotulo font-semibold uppercase tracking-[0.08em] text-ink-mute">Últimas falhas</p>
                {saude.filas.flatMap((f) =>
                  f.ultimasFalhas.map((falha, i) => (
                    <p key={`${f.nome}-${i}`} className="text-apoio text-ink-soft">
                      <span className="font-medium text-ink">{NOME_DA_FILA[f.nome] ?? f.nome}</span>
                      {falha.quando ? ` · ${tempoRelativo(falha.quando)}` : ""} · {falha.tentativas}{" "}
                      {falha.tentativas === 1 ? "tentativa" : "tentativas"}: <span className="text-danger">{falha.motivo}</span>
                    </p>
                  )),
                )}
              </div>
            ) : null}
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Integracao
          titulo="WhatsApp"
          parte={integracoes.whatsapp}
          resumo={(w) =>
            `${w.conectados} de ${w.total} conectados${w.ultimoEventoEm ? ` · última mensagem ${tempoRelativo(w.ultimoEventoEm)}` : ""}`
          }
          problemas={(w) => w.problemas}
          linha={(p) => `${p.situacao}${p.desde ? `, ${tempoRelativo(p.desde)}` : ""}`}
        />
        <Integracao
          titulo="Meta Ads"
          parte={integracoes.meta}
          resumo={(m) =>
            `${m.sincronizando} de ${m.total} sincronizando${m.ultimaSincroniaEm ? ` · última ${tempoRelativo(m.ultimaSincroniaEm)}` : ""}`
          }
          problemas={(m) => m.problemas}
          linha={(p) => `${p.situacao}${p.erro ? `: ${p.erro}` : ""}`}
        />
        <Integracao
          titulo="Google Ads"
          parte={integracoes.google}
          resumo={(g) => `${g.total} ${g.total === 1 ? "conta com script" : "contas com script"}`}
          problemas={(g) => g.problemas}
          linha={(p) => `${p.situacao}${p.ultimoEnvioEm ? `, último ${tempoRelativo(p.ultimoEnvioEm)}` : ""}`}
        />
        <Integracao
          titulo="API de Conversões"
          parte={integracoes.capi}
          resumo={(c) =>
            `Últimas 24 h: ${c.ultimas24h.enviados} enviados, ${c.ultimas24h.tentando} tentando, ${c.ultimas24h.falhos} falhos`
          }
          problemas={(c) => c.ultimasFalhas}
          linha={(p) => `${p.evento ?? "evento"}${p.erro ? `: ${p.erro}` : ""}${p.quando ? `, ${tempoRelativo(p.quando)}` : ""}`}
        />
      </div>
    </div>
  );
}

function formataPorcento(valor: number | null): string {
  if (valor === null) return "0%";
  return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function Indicador({ titulo, ok, valor, nota }: { titulo: string; ok: boolean; valor: string; nota?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-rotulo font-semibold uppercase tracking-[0.08em] text-ink-mute">{titulo}</p>
        <Badge tone={ok ? "success" : "danger"} dot>
          {ok ? "Bem" : "Atenção"}
        </Badge>
      </div>
      <p className="tnum mt-3 font-display text-2xl font-semibold tracking-tight text-ink">{valor}</p>
      {nota ? <p className="mt-1 text-apoio text-ink-mute">{nota}</p> : null}
    </Card>
  );
}

function Integracao<T>({
  titulo,
  parte,
  resumo,
  problemas,
  linha,
}: {
  titulo: string;
  parte: Parte<T>;
  resumo: (dados: T) => string;
  problemas: (dados: T) => Problema[];
  linha: (problema: Problema) => string;
}) {
  if (falhou(parte)) {
    return (
      <Card className="p-6">
        <CardHeader title={titulo} className="mb-3" />
        <Alert tom="danger" titulo="Não deu para ler">
          {parte.erro}
        </Alert>
      </Card>
    );
  }
  const lista = problemas(parte);
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-destaque font-semibold tracking-tight text-ink">{titulo}</h2>
        <Badge tone={lista.length ? "warning" : "success"} dot>
          {lista.length ? `${lista.length} com problema` : "Tudo certo"}
        </Badge>
      </div>
      <p className="text-corpo text-ink-soft">{resumo(parte)}</p>
      {lista.length ? (
        <ul className="mt-3 space-y-1.5">
          {lista.map((p, i) => (
            <li key={i} className="text-apoio text-ink-soft">
              <span className="font-medium text-ink">{p.cliente}</span>: {linha(p)}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
