import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/skeleton";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { descreveRegistro, destinoDoRegistro, RegistroDeAuditoria } from "@/lib/auditoria/descreve";

interface Pagina {
  itens: RegistroDeAuditoria[];
  proxima: string | null;
}

interface Pessoa {
  userId: string;
  nome: string | null;
  email: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FiltroDaAuditoria {
  categoria?: string;
  pessoa?: string;
  depoisDe?: string;
}

/**
 * Quem fez o quê na conta, do mais recente para o mais antigo.
 *
 * Existia gravado e não aparecia em lugar nenhum. Um registro que ninguém lê
 * não responde a pergunta que existe para responder, "quem pausou a campanha
 * ontem?", no único momento em que ela é feita: logo depois de algo dar
 * errado.
 */
export async function AbaAuditoria({ filtro: pedido }: { filtro: FiltroDaAuditoria }) {
  const [categorias, pessoas] = await Promise.all([
    apiFetch<{ chave: string; rotulo: string }[]>("/auditoria/categorias"),
    apiFetch<Pessoa[]>("/auditoria/pessoas"),
  ]);

  // A URL é texto de fora: um filtro que não existe vira "sem filtro", e não
  // uma tela de erro por causa de um link velho ou digitado errado.
  const filtro: FiltroDaAuditoria = {
    categoria: categorias.some((c) => c.chave === pedido.categoria) ? pedido.categoria : undefined,
    pessoa: pessoas.some((p) => p.userId === pedido.pessoa) ? pedido.pessoa : undefined,
    depoisDe: pedido.depoisDe && UUID.test(pedido.depoisDe) ? pedido.depoisDe : undefined,
  };

  const consulta = new URLSearchParams();
  if (filtro.categoria) consulta.set("categoria", filtro.categoria);
  if (filtro.pessoa) consulta.set("pessoa", filtro.pessoa);
  if (filtro.depoisDe) consulta.set("depoisDe", filtro.depoisDe);
  const pagina = await apiFetch<Pagina>(`/auditoria?${consulta.toString()}`);

  function url(novo: FiltroDaAuditoria) {
    const p = new URLSearchParams({ aba: "auditoria" });
    const categoria = novo.categoria === undefined ? filtro.categoria : novo.categoria;
    const pessoa = novo.pessoa === undefined ? filtro.pessoa : novo.pessoa;
    if (categoria) p.set("categoria", categoria);
    if (pessoa) p.set("pessoa", pessoa);
    if (novo.depoisDe) p.set("depoisDe", novo.depoisDe);
    return `/settings?${p.toString()}`;
  }

  const filtrando = Boolean(filtro.categoria || filtro.pessoa);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-corpo text-ink-soft">
          Cada ação importante na conta: entradas, senhas, equipe, integrações, anúncios, verba e exportações. Senhas,
          tokens e códigos nunca aparecem aqui.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GrupoDePilulas
          ativo={filtro.categoria ?? "todas"}
          opcoes={[
            { chave: "todas", rotulo: "Tudo", href: url({ categoria: "" }) },
            ...categorias.map((c) => ({ chave: c.chave, rotulo: c.rotulo, href: url({ categoria: c.chave }) })),
          ]}
        />
      </div>

      {pessoas.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-apoio text-ink-mute">
          <span>Pessoa:</span>
          <Link
            href={url({ pessoa: "" })}
            className={`focus-ring rounded-full px-2.5 py-1 ${!filtro.pessoa ? "bg-ink/[0.08] font-medium text-ink" : "hover:text-ink"}`}
          >
            Todas
          </Link>
          {pessoas.map((p) => (
            <Link
              key={p.userId}
              href={url({ pessoa: p.userId })}
              className={`focus-ring rounded-full px-2.5 py-1 ${
                filtro.pessoa === p.userId ? "bg-ink/[0.08] font-medium text-ink" : "hover:text-ink"
              }`}
            >
              {p.nome ?? p.email ?? "Sem nome"}
            </Link>
          ))}
        </div>
      ) : null}

      {pagina.itens.length === 0 ? (
        <div className="surface">
          <EmptyState
            title={filtrando ? "Nada com esses filtros" : "Nenhuma ação registrada ainda"}
            description={
              filtrando
                ? "Tente outro assunto ou outra pessoa."
                : "As próximas entradas, mudanças de senha e de configuração aparecem aqui."
            }
          />
        </div>
      ) : (
        <ol className="surface divide-y divide-line/60 overflow-hidden">
          {pagina.itens.map((item) => (
            <Linha key={item.id} item={item} />
          ))}
        </ol>
      )}

      {/*
        Por cursor, e não por número de página: o registro cresce enquanto se
        lê, e com página numerada a mesma linha apareceria duas vezes.
      */}
      <div className="flex flex-wrap items-center gap-4 text-apoio">
        {filtro.depoisDe ? (
          <Link href={url({})} className="focus-ring font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
            Voltar ao mais recente
          </Link>
        ) : null}
        {pagina.proxima ? (
          <Link
            href={url({ depoisDe: pagina.proxima })}
            className="focus-ring font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            Ver mais antigos
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Linha({ item }: { item: RegistroDeAuditoria }) {
  const descricao = descreveRegistro(item);
  const destino = destinoDoRegistro(item);
  const temEstado = temConteudo(item.before) || temConteudo(item.after);
  const falhou = item.action === "LOGIN_FAILED";

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className={`text-corpo ${falhou ? "text-red-700 dark:text-red-300" : "text-ink"}`}>
            {destino ? (
              <Link href={destino} className="hover:underline">
                {descricao}
              </Link>
            ) : (
              descricao
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-rotulo text-ink-mute">
            <span className="font-medium text-ink-soft">{item.autorNome ?? item.autorEmail ?? "Sistema"}</span>
            {/*
              A visita do suporte marcada à parte: é o que o cliente mais quer
              distinguir das ações da própria equipe.
            */}
            {item.viaSuporte ? <Badge tone="warning">Suporte da plataforma</Badge> : null}
            {item.aparelho ? <span>· {item.aparelho}</span> : null}
            {item.ip ? <span>· IP {item.ip}</span> : null}
          </p>
        </div>
        <time className="shrink-0 text-apoio text-ink-mute" dateTime={item.createdAt} title={dataCompleta(item.createdAt)}>
          {tempoRelativo(item.createdAt)}
        </time>
      </div>

      {temEstado ? (
        <details className="group mt-2">
          <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded text-rotulo font-medium text-ink-mute hover:text-ink-soft marker:hidden">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3 transition-transform duration-200 group-open:rotate-90"
              aria-hidden
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            Antes e depois
          </summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Estado titulo="Antes" valor={item.before} />
            <Estado titulo="Depois" valor={item.after} />
          </div>
        </details>
      ) : null}
    </li>
  );
}

function temConteudo(valor: unknown): boolean {
  return Boolean(valor && typeof valor === "object" && Object.keys(valor as object).length > 0);
}

function Estado({ titulo, valor }: { titulo: string; valor: unknown }) {
  const campos = temConteudo(valor) ? Object.entries(valor as Record<string, unknown>) : [];
  return (
    <div className="rounded-lg border border-line/60 bg-panel-soft/40 p-3">
      <p className="text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">{titulo}</p>
      {campos.length === 0 ? (
        <p className="mt-1 text-apoio text-ink-mute">Nada</p>
      ) : (
        <dl className="mt-1 space-y-0.5 text-apoio">
          {campos.map(([campo, conteudo]) => (
            <div key={campo} className="flex gap-2">
              <dt className="shrink-0 text-ink-mute">{campo}:</dt>
              <dd className="min-w-0 break-words text-ink-soft">
                {conteudo === null || conteudo === undefined
                  ? "vazio"
                  : typeof conteudo === "object"
                    ? JSON.stringify(conteudo)
                    : String(conteudo)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
