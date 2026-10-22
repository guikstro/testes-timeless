import Link from "next/link";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { BotaoCopiar } from "@/components/ui/copy-button";
import { dataCompleta, tempoRelativo } from "@/lib/relative-time";
import { CreateLinkForm } from "./create-link-form";
import { plataformaDe, REDES, Rede, redeDe } from "./plataformas";

export const metadata = { title: "Links" };

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

type Aba = "todos" | Rede | "como-usar";

/**
 * Links, com uma aba por rede.
 *
 * Quem abre a tela pensa em onde vai colar o link ("o do Google", "o da
 * bio"), e não numa lista única. Cada aba mostra os links daquela rede, uma
 * orientação curta e o botão de criar já com a rede escolhida, o que também
 * evita origem errada no relatório. "Como usar" é o guia para quem nunca usou.
 */
export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; criar?: string }>;
}) {
  const params = await searchParams;
  const { items } = await apiFetch<PaginatedResult<TrackingLinkListItem>>("/tracking-links?limit=100");

  const validas: Aba[] = ["todos", ...REDES.map((r) => r.chave), "como-usar"];
  const aba: Aba = validas.includes(params.aba as Aba) ? (params.aba as Aba) : items.length ? "todos" : "como-usar";
  const rede = REDES.find((r) => r.chave === aba) ?? null;
  const criando = params.criar === "1" || (aba !== "como-usar" && items.length === 0);

  const daRede = (chave: Rede) => items.filter((item) => redeDe(item.defaultSource, item.defaultMedium) === chave);
  const visiveis = rede ? daRede(rede.chave) : items;
  const hrefDaAba = (chave: Aba) => `/links?aba=${chave}`;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Links</h1>
      <p className="mt-1 max-w-2xl text-corpo text-ink-mute">
        Um endereço para colar onde a pessoa clica para falar com você. Quando ela manda a mensagem, o sistema sabe de onde
        ela veio.
      </p>

      <nav className="mb-8 mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Redes">
        <Aba href={hrefDaAba("todos")} ativa={aba === "todos"} rotulo="Todos" quantos={items.length} />
        {REDES.map((r) => (
          <Aba key={r.chave} href={hrefDaAba(r.chave)} ativa={aba === r.chave} rotulo={r.rotulo} quantos={daRede(r.chave).length} cor={r.cor} />
        ))}
        <span className="ml-auto" />
        <Aba href={hrefDaAba("como-usar")} ativa={aba === "como-usar"} rotulo="Como usar" />
      </nav>

      {aba === "como-usar" ? (
        <ComoUsar exemplo={items[0]?.publicUrl ?? null} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{rede?.titulo ?? "Todos os links"}</h2>
              <p className="mt-1 text-corpo leading-relaxed text-ink-mute">
                {rede?.orientacao ?? "Os links de todas as redes. Abra a aba de uma rede para ver só os dela."}
              </p>
            </div>
            {!criando ? (
              <Link
                href={`/links?aba=${aba}&criar=1`}
                className="focus-ring shrink-0 rounded-full bg-ink px-4 py-2 text-corpo font-medium text-canvas"
              >
                {rede ? `Criar link do ${rede.chave === "site" ? "site" : rede.rotulo}` : "Criar link"}
              </Link>
            ) : null}
          </div>

          {criando ? (
            <div className="mt-6">
              <CreateLinkForm key={aba} plataformas={rede?.plataformas} />
              {items.length ? (
                <Link href={`/links?aba=${aba}`} className="mt-3 inline-block text-apoio text-ink-mute underline underline-offset-2">
                  Fechar
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8">
            <SeusLinks items={visiveis} rede={rede?.rotulo ?? null} />
          </div>
        </>
      )}
    </div>
  );
}

function Aba({ href, ativa, rotulo, quantos, cor }: { href: string; ativa: boolean; rotulo: string; quantos?: number; cor?: string }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={`focus-ring relative -mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2.5 text-corpo font-medium transition-colors ${
        ativa ? "text-ink" : "text-ink-mute hover:text-ink-soft"
      }`}
    >
      {cor ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} aria-hidden /> : null}
      {rotulo}
      {quantos !== undefined ? (
        <span className="rounded-full bg-panel-soft px-1.5 text-rotulo tabular-nums text-ink-mute">{quantos}</span>
      ) : null}
      {ativa ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
    </Link>
  );
}

function SeusLinks({ items, rede }: { items: TrackingLinkListItem[]; rede: string | null }) {
  if (items.length === 0) {
    return (
      <p className="border-t border-line/70 py-10 text-center text-corpo text-ink-mute">
        {rede ? `Nenhum link do ${rede} ainda.` : "Nenhum link ainda."}
      </p>
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
