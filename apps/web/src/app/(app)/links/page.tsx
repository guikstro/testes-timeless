import Link from "next/link";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { BotaoCopiar } from "@/components/ui/copy-button";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { CreateLinkForm } from "./create-link-form";
import { plataformaDe } from "./plataformas";

interface TrackingLinkListItem {
  id: string;
  name: string;
  code: string;
  destinationUrl: string;
  defaultSource: string | null;
  defaultMedium: string | null;
  createdAt: string;
  _count: { clicks: number };
  /** Quantos leads chegaram por este link. Ausente na API anterior. */
  leads?: number;
  /** Endereço já montado pela API, pronto para colar no anúncio. */
  publicUrl: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

type Aba = "links" | "criar" | "como-usar";

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "links", rotulo: "Seus links" },
  { chave: "criar", rotulo: "Criar link" },
  { chave: "como-usar", rotulo: "Como usar" },
];

/**
 * Links rastreáveis, em três abas.
 *
 * Era uma página só com explicação, formulário e tabela empilhados, e quem
 * entrava para copiar um link tinha de passar pelo formulário, enquanto quem
 * não sabia o que fazer não achava a explicação. Agora cada coisa tem o seu
 * lugar: a lista para o dia a dia, o passo a passo para criar e um guia para
 * quem nunca usou, com o código pronto para a landing page.
 */
export default async function LinksPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const params = await searchParams;
  const { items } = await apiFetch<PaginatedResult<TrackingLinkListItem>>("/tracking-links?limit=50");

  // Sem link nenhum, a lista estaria vazia: a tela abre direto no criar.
  const padrao: Aba = items.length ? "links" : "criar";
  const aba: Aba = ABAS.some((opcao) => opcao.chave === params.aba) ? (params.aba as Aba) : padrao;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Links</h1>
      <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
        Um endereço para colar onde a pessoa clica para falar com você. Quando ela manda a mensagem, o sistema sabe de onde
        ela veio.
      </p>

      <nav className="mb-8 mt-6 flex gap-1 border-b border-line" aria-label="Seções de links">
        {ABAS.map((opcao) => {
          const ativa = opcao.chave === aba;
          return (
            <Link
              key={opcao.chave}
              href={`/links?aba=${opcao.chave}`}
              aria-current={ativa ? "page" : undefined}
              className={`focus-ring relative -mb-px rounded-t-lg px-3.5 py-2.5 text-corpo font-medium transition-colors ${
                ativa ? "text-ink" : "text-ink-mute hover:text-ink-soft"
              }`}
            >
              {opcao.rotulo}
              {opcao.chave === "links" && items.length ? (
                <span className="ml-1.5 rounded-full bg-panel-soft px-1.5 text-rotulo tabular-nums text-ink-mute">{items.length}</span>
              ) : null}
              {ativa ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
            </Link>
          );
        })}
      </nav>

      {aba === "links" ? <SeusLinks items={items} /> : null}
      {aba === "criar" ? <Criar /> : null}
      {aba === "como-usar" ? <ComoUsar exemplo={items[0]?.publicUrl ?? null} /> : null}
    </div>
  );
}

function SeusLinks({ items }: { items: TrackingLinkListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="font-display text-xl font-semibold tracking-tight text-ink">Você ainda não tem links</p>
        <p className="mx-auto mt-2 max-w-md text-corpo text-ink-mute">
          Crie o primeiro para colar no Google, na bio do Instagram ou na sua página.
        </p>
        <Link href="/links?aba=criar" className="focus-ring mt-5 inline-flex rounded-full bg-ink px-4 py-2 text-corpo font-medium text-canvas">
          Criar o primeiro link
        </Link>
      </div>
    );
  }

  const cliques = items.reduce((soma, item) => soma + item._count.clicks, 0);
  const leads = items.reduce((soma, item) => soma + (item.leads ?? 0), 0);

  return (
    <div>
      <p className="max-w-2xl font-display text-xl font-medium leading-snug tracking-[-0.01em] text-ink">
        {items.length} {items.length === 1 ? "link" : "links"}, {inteiro(cliques)} {cliques === 1 ? "clique" : "cliques"} e{" "}
        <span className="text-accent">
          {inteiro(leads)} {leads === 1 ? "lead" : "leads"}
        </span>{" "}
        até agora.
      </p>
      <p className="mt-1 text-apoio text-ink-mute">Um clique vira lead quando a pessoa manda a primeira mensagem.</p>

      <ul className="mt-6 border-t border-line/70">
        {items.map((item) => {
          const plataforma = plataformaDe(item.defaultSource, item.defaultMedium);
          return (
            <li key={item.id} className="grid gap-3 border-b border-line/70 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_9rem] md:items-center md:gap-6">
              <div className="min-w-0">
                <p className="truncate text-destaque font-semibold text-ink">{item.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-apoio text-ink-mute">
                  {plataforma || item.defaultSource ? (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: plataforma?.cor ?? "#9CA3AF" }} aria-hidden />
                      {plataforma?.rotulo ?? item.defaultSource}
                      <span aria-hidden>,</span>
                    </>
                  ) : null}
                  <span title={dataCompleta(item.createdAt)}>criado {tempoRelativo(item.createdAt)}</span>
                </p>
                <p className="mt-1 truncate text-rotulo text-ink-mute" title={item.destinationUrl}>
                  Leva para {destinoLegivel(item.destinationUrl)}
                </p>
              </div>

              {/* O link existe para ser colado: copiar é o gesto principal da tela. */}
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel-soft px-3 py-2 font-mono text-apoio text-ink-soft">
                  {item.publicUrl}
                </code>
                <BotaoCopiar texto={item.publicUrl} rotulo={`Copiar o link de ${item.name}`} />
              </div>

              <div className="flex gap-6 md:justify-end md:text-right">
                <div>
                  <p className="font-display text-lg font-semibold tabular-nums text-ink">{inteiro(item._count.clicks)}</p>
                  <p className="text-rotulo text-ink-mute">{item._count.clicks === 1 ? "clique" : "cliques"}</p>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold tabular-nums text-accent">{inteiro(item.leads ?? 0)}</p>
                  <p className="text-rotulo text-ink-mute">{item.leads === 1 ? "lead" : "leads"}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Criar() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <CreateLinkForm />
      <aside className="space-y-5 text-corpo leading-relaxed text-ink-soft">
        <div>
          <p className="font-semibold text-ink">Antes de criar</p>
          <p className="mt-1">
            Anúncio da Meta que abre o WhatsApp direto não precisa de link: a própria Meta avisa de qual anúncio a pessoa
            veio.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink">Um link por lugar</p>
          <p className="mt-1">
            Crie um para a bio, outro para o Google, outro para a página. É assim que o relatório separa o que cada lugar
            trouxe.
          </p>
        </div>
        <Link href="/links?aba=como-usar" className="inline-block font-medium text-accent underline underline-offset-2">
          Ver o guia completo
        </Link>
      </aside>
    </div>
  );
}

function ComoUsar({ exemplo }: { exemplo: string | null }) {
  const link = exemplo ?? "https://SEU-LINK-AQUI";
  const codigo = `<a id="botao-whatsapp" href="${link}">Falar no WhatsApp</a>
<script>
  // Repassa o código do clique do Google e as UTMs da página para o link.
  (function () {
    var pagina = new URLSearchParams(location.search);
    var botao = document.getElementById("botao-whatsapp");
    var destino = new URL(botao.href);
    ["gclid", "fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (campo) {
      if (pagina.get(campo)) destino.searchParams.set(campo, pagina.get(campo));
    });
    botao.href = destino.toString();
  })();
</script>`;

  return (
    <div className="max-w-3xl space-y-12">
      <Secao titulo="Você precisa de link?">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink">Não precisa</p>
            <p className="mt-1">
              Anúncio do Facebook ou Instagram que abre o WhatsApp direto. A Meta manda junto com a primeira mensagem qual
              anúncio a pessoa clicou, e o sistema liga o lead à campanha sozinho.
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink">Precisa</p>
            <p className="mt-1">
              Google Ads, bio do Instagram, stories, status do WhatsApp, seu site ou landing page, e-mail. Nesses lugares
              ninguém avisa de onde a pessoa veio, e o link faz esse papel.
            </p>
          </div>
        </div>
      </Secao>

      <Secao titulo="Como funciona">
        <ol className="space-y-3">
          {[
            "A pessoa clica no seu link.",
            "O sistema anota o clique, com a origem e a campanha, e abre o WhatsApp com uma mensagem pronta.",
            "No fim da mensagem vai um código curto, como [ref:AB12CD]. É ele que liga a conversa ao clique; não precisa explicar nada para a pessoa.",
            "Quando ela envia, vira lead já com a origem certa.",
          ].map((texto, i) => (
            <li key={texto} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
              <span className="font-display font-semibold tabular-nums text-accent">{i + 1}.</span>
              <span>{texto}</span>
            </li>
          ))}
        </ol>
      </Secao>

      <Secao titulo="Na sua landing page">
        <p>
          Use o link no botão de WhatsApp da página. Se a página recebe gente do Google Ads, o Google coloca no endereço da
          página um código do clique (gclid). Para esse código chegar até aqui, o botão precisa repassá-lo. Cole este trecho
          na página, no lugar do botão atual{exemplo ? ", já com o seu primeiro link" : ", trocando o endereço pelo seu link"}:
        </p>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-line bg-panel-soft p-4 font-mono text-rotulo leading-relaxed text-ink-soft">
            {codigo}
          </pre>
          <div className="absolute right-2 top-2">
            <BotaoCopiar texto={codigo} rotulo="Copiar o código do botão" />
          </div>
        </div>
        <p className="mt-4">
          Se a página monta uma mensagem com as respostas da pessoa (uma triagem), acrescente ao link{" "}
          <code className="rounded bg-panel-soft px-1.5 py-0.5 font-mono text-apoio">?text=</code> com a mensagem. Ela
          substitui o texto padrão, e o código do clique continua indo no fim.
        </p>
      </Secao>

      <Secao titulo="Como testar">
        <ol className="space-y-3">
          {[
            "Abra o link no celular, de preferência em um número que ainda não seja lead.",
            "Envie a mensagem que aparece pronta, sem apagar o código do fim.",
            "Em até um minuto, o lead aparece em Leads com a origem do link. Se aparecer sem origem, o código foi apagado ou o link não é este.",
          ].map((texto, i) => (
            <li key={texto} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
              <span className="font-display font-semibold tabular-nums text-accent">{i + 1}.</span>
              <span>{texto}</span>
            </li>
          ))}
        </ol>
      </Secao>

      <Secao titulo="Dúvidas comuns">
        <dl className="space-y-5">
          <Pergunta pergunta="Por que tenho mais cliques que leads?">
            Nem todo mundo que abre o WhatsApp envia a mensagem. O clique conta quem abriu; o lead, quem escreveu.
          </Pergunta>
          <Pergunta pergunta="Posso usar o mesmo link em dois lugares?">
            Pode, mas o relatório não vai saber separar o que cada lugar trouxe. Um link por lugar dá a resposta certa.
          </Pergunta>
          <Pergunta pergunta="E se a pessoa apagar o código da mensagem?">
            Ela vira lead do mesmo jeito, mas sem origem. Por isso o código vai no fim, onde quase ninguém mexe.
          </Pergunta>
        </dl>
      </Secao>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{titulo}</h2>
      <div className="mt-3 text-corpo leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Pergunta({ pergunta, children }: { pergunta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-ink">{pergunta}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/** "WhatsApp (85) 99999-9999" ou o endereço da página, sem o https. */
function destinoLegivel(url: string): string {
  const whatsapp = /wa\.me\/(\d+)/.exec(url);
  if (whatsapp) {
    const digitos = whatsapp[1].startsWith("55") ? whatsapp[1].slice(2) : whatsapp[1];
    return digitos.length >= 10
      ? `WhatsApp (${digitos.slice(0, 2)}) ${digitos.slice(2, digitos.length - 4)}-${digitos.slice(-4)}`
      : "WhatsApp";
  }
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function inteiro(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}
