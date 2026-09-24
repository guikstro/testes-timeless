import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { conexaoDoWhatsApp } from "@/lib/conexao-do-whatsapp";
import { BotaoCopiar } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/skeleton";
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
  /** Endereço já montado pela API, pronto para colar no anúncio. */
  publicUrl: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export default async function LinksPage() {
  const [{ items }, conexao] = await Promise.all([
    apiFetch<PaginatedResult<TrackingLinkListItem>>("/tracking-links?limit=50"),
    conexaoDoWhatsApp(),
  ]);

  const totalDeCliques = items.reduce((soma, item) => soma + item._count.clicks, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Links rastreáveis</h1>
      <p className="mb-6 mt-1 max-w-2xl text-corpo text-ink-mute">
        Um endereço para colar onde a pessoa clica para falar com você. Quando ela manda a mensagem, o sistema sabe de
        onde ela veio.
      </p>

      {/*
        A tela induzia a criar link para tudo, inclusive para o anúncio da Meta
        que abre o WhatsApp, que é o caso mais comum e o único que dispensa
        link: a Meta manda o anúncio junto da mensagem. Dizer isso antes do
        formulário poupa um link que nunca seria clicado.
      */}
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="surface p-5">
          <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Não precisa de link</p>
          <p className="mt-2 text-corpo font-medium text-ink">Anúncio da Meta que abre o WhatsApp</p>
          <p className="mt-1 text-apoio leading-relaxed text-ink-mute">
            A Meta manda qual anúncio foi junto com a primeira mensagem, e o sistema liga o lead à campanha sozinho.
            {conexao === null || conexao?.status !== "CONNECTED" ? (
              <>
                {" "}
                Para isso o WhatsApp precisa estar{" "}
                <Link href="/integrations/whatsapp" className="font-medium text-ink underline underline-offset-2">
                  conectado
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
        <div className="surface p-5">
          <p className="text-rotulo font-semibold uppercase tracking-[0.11em] text-ink-mute">Use um link</p>
          <p className="mt-2 text-corpo font-medium text-ink">Google, bio do Instagram, stories, site, e-mail</p>
          <p className="mt-1 text-apoio leading-relaxed text-ink-mute">
            Nesses lugares ninguém avisa de onde a pessoa veio. O link avisa: cada clique fica registrado, e vira lead
            quando a pessoa manda a primeira mensagem.
          </p>
        </div>
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Criar um link</h2>
      <div className="mb-8">
        <CreateLinkForm />
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">Seus links</h2>

      {items.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            }
            title="Nenhum link criado ainda"
            description="Os links que você criar aparecem aqui, com o botão de copiar e quantos cliques cada um teve."
          />
        </div>
      ) : (
        <>
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left">
                <thead>
                  <tr className="border-b border-line text-rotulo font-semibold uppercase tracking-[0.09em] text-ink-mute">
                    <th className="px-4 py-3 font-semibold">Nome</th>
                    <th className="px-4 py-3 font-semibold">Link para colar</th>
                    <th className="px-4 py-3 font-semibold">Destino</th>
                    <th className="px-4 py-3 text-right font-semibold">Cliques</th>
                    <th className="px-4 py-3 text-right font-semibold">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    // Montado pela API, que é quem sabe o endereço público
                    // deste sistema. Duas cópias da mesma configuração já
                    // colocaram um localhost dentro de anúncio.
                    const url = item.publicUrl;
                    return (
                      <tr key={item.id} className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-soft/50">
                        <td className="px-4 py-3">
                          <p className="text-corpo font-medium text-ink">{item.name}</p>
                          {/*
                            De onde o link foi publicado, logo abaixo do nome:
                            é assim que se acha "o link do stories" numa lista
                            de vinte, sem abrir cada um.
                          */}
                          {(() => {
                            const plataforma = plataformaDe(item.defaultSource, item.defaultMedium);
                            if (!plataforma && !item.defaultSource) return null;
                            return (
                              <p className="mt-0.5 flex items-center gap-1.5 text-rotulo text-ink-mute">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: plataforma?.cor ?? "#9CA3AF" }}
                                  aria-hidden
                                />
                                {plataforma?.rotulo ?? item.defaultSource}
                              </p>
                            );
                          })()}
                        </td>

                        {/*
                          O botão de copiar é o ponto da tela inteira: o link
                          existe para ser colado num anúncio, e antes era texto
                          solto que obrigava a selecionar com o mouse.
                        */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <code className="min-w-0 truncate rounded-md bg-panel-soft px-2 py-1 font-mono text-rotulo text-ink-soft">
                              {url}
                            </code>
                            <BotaoCopiar texto={url} rotulo={`Copiar o link de ${item.name}`} />
                          </div>
                        </td>

                        <td className="max-w-[14rem] truncate px-4 py-3 text-apoio text-ink-mute" title={item.destinationUrl}>
                          {item.destinationUrl}
                        </td>

                        <td className="px-4 py-3 text-right text-corpo tabular-nums text-ink">
                          {item._count.clicks}
                        </td>

                        <td className="px-4 py-3 text-right text-apoio text-ink-mute" title={dataCompleta(item.createdAt)}>
                          {tempoRelativo(item.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 text-apoio text-ink-mute">
            {items.length} {items.length === 1 ? "link" : "links"} · {totalDeCliques}{" "}
            {totalDeCliques === 1 ? "clique registrado" : "cliques registrados"}.{" "}
            {/*
              Clique não é lead. Dizer isso aqui evita a conta errada de
              comparar cliques com leads e concluir que o rastreio perdeu gente.
            */}
            Um clique vira lead quando a pessoa manda a primeira mensagem.
          </p>
        </>
      )}
    </div>
  );
}
