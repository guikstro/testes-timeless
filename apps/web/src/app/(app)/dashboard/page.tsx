import Link from "next/link";
import { AtualizaAoVivo } from "@/components/notifications/atualiza-ao-vivo";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { apiFetch } from "@/lib/api-client";
import { formataDia } from "@/lib/periodo";
import { AbaVisaoGeral } from "./aba-visao-geral";
import { AbaFunil } from "./aba-funil";
import { AbaOrigem } from "./aba-origem";
import { AbaAtendimento } from "./aba-atendimento";
import { Overview } from "./tipos";

const PERIODOS = [7, 30, 90];

/**
 * Uma pergunta por aba.
 *
 * A tela anterior empilhava oito painéis numa rolagem só, e responder
 * "quantos leads entraram" exigia passar por gráfico de horário, tabela de
 * origem e funil. Aqui cada aba responde uma coisa, e o que não é daquela
 * pergunta não aparece.
 */
const ABAS = [
  { chave: "geral", rotulo: "Visão geral", pergunta: "Quanto entrou, e melhorou?" },
  { chave: "funil", rotulo: "Funil", pergunta: "Onde as pessoas somem?" },
  { chave: "origem", rotulo: "Origem", pergunta: "O que traz cliente que paga?" },
  { chave: "atendimento", rotulo: "Atendimento", pergunta: "Estamos respondendo a tempo?" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; aba?: string }>;
}) {
  const params = await searchParams;
  const days = PERIODOS.includes(Number(params.days)) ? Number(params.days) : 30;
  const aba: Aba = ABAS.some((opcao) => opcao.chave === params.aba) ? (params.aba as Aba) : "geral";

  const overview = await apiFetch<Overview>(`/analytics/overview?days=${days}`);
  const { totals, setup } = overview;

  const semOrigem = overview.byOrigin.find((bucket) => bucket.key === "unknown");
  const maioriaSemOrigem = totals.leads > 0 && (semOrigem?.leads ?? 0) / totals.leads >= 0.5;

  const escolhida = ABAS.find((opcao) => opcao.chave === aba)!;
  const paraAba = (destino: string) => `/dashboard?aba=${destino}&days=${days}`;

  return (
    <div className="mx-auto max-w-6xl">
      <AtualizaAoVivo />

      {/*
        Um cabeçalho só, igual em todas as abas: a pergunta muda, o lugar de
        trocar de período e de aba não.
      */}
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-rotulo font-semibold uppercase tracking-[0.14em] text-ink-mute">
              {formataDia(overview.period.from.slice(0, 10))} a {formataDia(overview.period.to.slice(0, 10))}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
              {escolhida.rotulo}
            </h1>
            <p className="mt-0.5 text-corpo text-ink-mute">{escolhida.pergunta}</p>
          </div>

          <GrupoDePilulas
            ativo={String(days)}
            opcoes={PERIODOS.map((opcao) => ({
              chave: String(opcao),
              rotulo: `${opcao} dias`,
              href: `/dashboard?aba=${aba}&days=${opcao}`,
            }))}
          />
        </div>

        <nav className="mt-5 flex gap-1 border-b border-line" aria-label="Seções do dashboard">
          {ABAS.map((opcao) => {
            const ativa = opcao.chave === aba;
            return (
              <Link
                key={opcao.chave}
                href={paraAba(opcao.chave)}
                aria-current={ativa ? "page" : undefined}
                /* Sublinhado e não pílula: a aba pertence ao cabeçalho e
                   precisa parecer parte dele, não um controle solto. */
                className={`focus-ring relative -mb-px rounded-t-lg px-3.5 py-2.5 text-corpo font-medium transition-colors duration-200 ease-soft ${
                  ativa ? "text-ink" : "text-ink-mute hover:text-ink-soft"
                }`}
              >
                {opcao.rotulo}
                {ativa ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
              </Link>
            );
          })}
        </nav>
      </header>

      {aba === "geral" ? <AbaVisaoGeral overview={overview} /> : null}
      {aba === "funil" ? <AbaFunil overview={overview} /> : null}
      {aba === "origem" ? <AbaOrigem overview={overview} /> : null}
      {aba === "atendimento" ? <AbaAtendimento overview={overview} /> : null}

      {/*
        O aviso de origem desconhecida acompanha todas as abas: enquanto a
        maioria dos leads não tem origem, qualquer número desta tela é lido
        com uma ressalva que precisa estar à vista.
      */}
      {maioriaSemOrigem ? (
        <div className="mt-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-corpo text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">A maior parte dos leads está sem origem identificada.</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200/90">
            A origem só é registrada quando a pessoa chega por um anúncio Click-to-WhatsApp ou por um link
            rastreável. Quem manda mensagem direto para o número não carrega essa evidência, e ela nunca é deduzida
            por aproximação.
          </p>
          <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200/90">
            {!setup.metaConnected ? (
              <li>
                · <Link href="/integrations/meta" className="underline">Conecte sua conta Meta</Link> para
                identificar leads vindos de anúncios.
              </li>
            ) : null}
            {setup.trackingLinkCount === 0 ? (
              <li>
                · <Link href="/links" className="underline">Crie um link rastreável</Link> para usar na bio e em
                campanhas.
              </li>
            ) : null}
            {!setup.whatsappConnected ? (
              <li>
                · <Link href="/integrations/whatsapp" className="underline">Conecte seu WhatsApp</Link> para receber
                novos leads.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
