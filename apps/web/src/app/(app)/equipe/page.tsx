import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { sessaoAtual } from "@/lib/sessao";
import { AdicionaPessoa, RevogaAcesso } from "./formularios";

interface PessoaDaEquipe {
  id: string;
  name: string;
  email: string;
  platformRole: "SUPPORT" | "ADMIN";
  clientesQueAtendo?: { organization: { id: string; name: string } }[];
}

interface Acesso {
  id: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  organization: { name: string } | null;
}

/**
 * Equipe e sócios.
 *
 * Quem da Timeless tem acesso à administração, o que cada um pode fazer e
 * quais clientes atende; e o registro de toda entrada num cliente. Era o site
 * de administração à parte, com outra senha de entrada e outro endereço.
 */
export default async function EquipePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const [{ user }, params] = await Promise.all([sessaoAtual(), searchParams]);
  if (user.platformRole !== "ADMIN") redirect("/inicio");
  const aba = params.aba === "acessos" ? "acessos" : "pessoas";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Equipe e sócios</h1>
      <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
        Quem da Timeless entra na administração. Sócios veem todos os clientes e cuidam da equipe; operadores atendem só os
        clientes que forem deles.
      </p>

      <nav className="mb-8 mt-6 flex gap-1 border-b border-line" aria-label="Seções da equipe">
        {[
          { chave: "pessoas", rotulo: "Pessoas" },
          { chave: "acessos", rotulo: "Entradas em clientes" },
        ].map((opcao) => (
          <Link
            key={opcao.chave}
            href={`/equipe?aba=${opcao.chave}`}
            aria-current={aba === opcao.chave ? "page" : undefined}
            className={`focus-ring relative -mb-px rounded-t-lg px-3.5 py-2.5 text-corpo font-medium ${aba === opcao.chave ? "text-ink" : "text-ink-mute hover:text-ink-soft"}`}
          >
            {opcao.rotulo}
            {aba === opcao.chave ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </Link>
        ))}
      </nav>

      {aba === "pessoas" ? <Pessoas /> : <Acessos />}
    </div>
  );
}

async function Pessoas() {
  const pessoas = await apiFetch<PessoaDaEquipe[]>("/admin/operators");
  return (
    <div className="space-y-10">
      <ul className="border-t border-line/70">
        {pessoas.map((pessoa) => {
          const clientes = pessoa.clientesQueAtendo?.map((c) => c.organization.name) ?? [];
          return (
            <li key={pessoa.id} className="grid gap-2 border-b border-line/70 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <p className="truncate text-destaque font-semibold text-ink">{pessoa.name}</p>
                <p className="truncate text-apoio text-ink-mute">{pessoa.email}</p>
              </div>
              <div className="text-corpo text-ink-soft">
                <span className={`mr-2 rounded-full px-2.5 py-0.5 text-rotulo font-medium ${pessoa.platformRole === "ADMIN" ? "bg-accent/10 text-accent" : "bg-panel-soft text-ink-soft"}`}>
                  {pessoa.platformRole === "ADMIN" ? "Sócio" : "Operador"}
                </span>
                {pessoa.platformRole === "ADMIN"
                  ? "vê todos os clientes"
                  : clientes.length
                    ? `atende ${clientes.join(", ")}`
                    : "ainda não atende nenhum cliente"}
              </div>
              <div className="sm:text-right">
                <RevogaAcesso userId={pessoa.id} nome={pessoa.name} />
              </div>
            </li>
          );
        })}
      </ul>

      <section>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Dar acesso a alguém</h2>
        <p className="mb-4 mt-1 text-corpo text-ink-mute">
          Para mudar o nível de quem já é da equipe, informe o mesmo e-mail com o nível novo. Os clientes de cada operador
          se escolhem na página do cliente.
        </p>
        <AdicionaPessoa />
      </section>
    </div>
  );
}

async function Acessos() {
  const { items } = await apiFetch<{ items: Acesso[] }>("/admin/impersonations?limit=50");
  if (items.length === 0) return <p className="py-10 text-center text-corpo text-ink-mute">Ninguém entrou em um cliente ainda.</p>;
  return (
    <div>
      <p className="mb-4 text-corpo text-ink-mute">Toda vez que alguém da equipe entra num cliente, fica registrado aqui, sem exceção.</p>
      <ul className="border-t border-line/70">
        {items.map((acesso) => (
          <li key={acesso.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line/70 py-3 text-corpo">
            <span className="text-ink-soft">
              <span className="font-medium text-ink">{acesso.user?.name ?? "Pessoa removida"}</span> entrou em{" "}
              <span className="font-medium text-ink">{acesso.organization?.name ?? "cliente removido"}</span>
            </span>
            <span className="text-apoio tabular-nums text-ink-mute">{new Date(acesso.createdAt).toLocaleString("pt-BR")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
