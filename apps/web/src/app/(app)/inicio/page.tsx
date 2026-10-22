import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { sessaoAtual } from "@/lib/sessao";
import type { Foco } from "@/lib/foco";
import { BotaoEntrar } from "../clientes/botao-entrar";

export const metadata = { title: "Início" };

interface ClienteDoPainel {
  id: string;
  name: string;
  foco: Foco;
  brandColor: string | null;
  leadsSeteDias: number | null;
  conexoes: { whatsapp: string | null; meta: string | null; googleUltimoEnvio: string | null };
  alertas: { nivel: "erro" | "atencao"; texto: string }[];
}

const TIPO: Record<Foco, string> = { LEADS: "WhatsApp", PRESENCA_LOCAL: "Loja física", AMBOS: "Os dois" };

/**
 * O Início da administração.
 *
 * A primeira tela de quem é da equipe Timeless responde duas perguntas, nesta
 * ordem: o que precisa de mim hoje, e como estão os meus clientes. O operador
 * vê só os clientes que atende; o sócio vê todos.
 */
export default async function InicioDaAdministracao() {
  const [{ user }, clientes] = await Promise.all([sessaoAtual(), apiFetch<ClienteDoPainel[]>("/admin/painel")]);

  const comAlerta = clientes.filter((c) => c.alertas.length > 0);
  const ordenados = [...clientes].sort(
    (a, b) => peso(b) - peso(a) || a.name.localeCompare(b.name, "pt-BR"),
  );
  const primeiroNome = user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-[1.9rem] font-semibold tracking-tight text-ink">{saudacao()}, {primeiroNome}</h1>
      <p className="mt-1 text-destaque text-ink-mute">
        {clientes.length === 0
          ? user.platformRole === "ADMIN"
            ? "Nenhum cliente cadastrado ainda."
            : "Nenhum cliente foi atribuído a você ainda. Um sócio define quem atende cada cliente."
          : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}${
              comAlerta.length ? `, ${comAlerta.length} ${comAlerta.length === 1 ? "pede" : "pedem"} atenção hoje` : ", tudo em dia"
            }.`}
      </p>

      {comAlerta.length ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Precisa de atenção</h2>
          <ul className="mt-3 border-t border-line/70">
            {comAlerta.flatMap((cliente) =>
              cliente.alertas.map((alerta, i) => (
                <li key={`${cliente.id}-${i}`} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line/70 py-3.5">
                  <span className={`mt-1.5 h-2 w-2 rounded-full ${alerta.nivel === "erro" ? "bg-danger" : "bg-warning-line"}`} aria-hidden />
                  <p className="text-corpo text-ink-soft">
                    <span className="font-semibold text-ink">{cliente.name}</span>: {alerta.texto}
                  </p>
                  <Link href={`/clientes/${cliente.id}`} className="focus-ring rounded text-apoio font-medium text-accent underline underline-offset-2">
                    Abrir cliente
                  </Link>
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {clientes.length ? (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {user.platformRole === "ADMIN" ? "Clientes" : "Seus clientes"}
            </h2>
            <Link href="/clientes" className="text-apoio text-ink-mute underline underline-offset-2 hover:text-ink">
              Ver todos os detalhes
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-corpo">
              <thead>
                <tr className="border-b border-line text-apoio text-ink-mute">
                  <th className="py-2.5 pr-4 font-medium">Cliente</th>
                  <th className="py-2.5 pr-4 font-medium">Tipo</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Leads em 7 dias</th>
                  <th className="py-2.5 pr-4 font-medium">Situação</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {ordenados.map((cliente) => {
                  const pior = cliente.alertas.find((a) => a.nivel === "erro") ?? cliente.alertas[0];
                  return (
                    <tr key={cliente.id} className="border-b border-line/60">
                      <td className="py-3 pr-4">
                        <Link href={`/clientes/${cliente.id}`} className="flex items-center gap-2.5 font-medium text-ink hover:underline">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cliente.brandColor ?? "#9CA3AF" }} aria-hidden />
                          {cliente.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-ink-soft">{TIPO[cliente.foco]}</td>
                      <td className="py-3 pr-4 text-right font-display font-semibold tabular-nums text-ink">
                        {cliente.leadsSeteDias === null ? <span className="font-sans font-normal text-ink-mute">–</span> : cliente.leadsSeteDias}
                      </td>
                      <td className={`py-3 pr-4 text-apoio ${pior ? (pior.nivel === "erro" ? "text-danger" : "text-warning") : "text-success"}`}>
                        {pior ? resumo(pior.texto) : "Tudo em dia"}
                      </td>
                      <td className="py-3 text-right">
                        <BotaoEntrar organizationId={cliente.id} nome={cliente.name} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Erro antes de atenção, atenção antes de tudo em dia. */
function peso(cliente: ClienteDoPainel): number {
  if (cliente.alertas.some((a) => a.nivel === "erro")) return 2;
  return cliente.alertas.length ? 1 : 0;
}

/** A primeira frase do alerta, que cabe numa célula. */
function resumo(texto: string): string {
  return texto.split(".")[0];
}

function saudacao(): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}
