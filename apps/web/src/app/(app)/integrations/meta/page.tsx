import { unstable_rethrow } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { formatCentsAsBRL } from "@/lib/currency";
import { Alert } from "@/components/ui/alert";
import { ConnectMetaForm } from "./connect-form";
import { ConnectionActions } from "./connection-actions";
import { ConnectMetaCapiForm } from "./capi-connect-form";
import { PaginaDaMetaForm } from "./pagina-form";

interface MetaConnection {
  id: string;
  adAccountId: string;
  status: "CONNECTED" | "DISCONNECTED" | "TOKEN_EXPIRED" | "SYNC_FAILED";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  /** Até quando a Meta bloqueou as chamadas por excesso de pedidos. */
  limitadaAte: string | null;
  /** A Página do Facebook dos Insights. Opcionais: uma API anterior a eles não manda os campos. */
  paginaId?: string | null;
  paginaNome?: string | null;
  paginaSincronizadaEm?: string | null;
  paginaErro?: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
  pixelId: string | null;
  hasCapiAccessToken: boolean;
  capiConfiguredAt: string | null;
}

type ConversionEventType = "LEAD" | "QUALIFIED_LEAD" | "PURCHASE";
type ConversionEventStatus = "PENDING" | "SENT" | "RETRYING" | "FAILED";

interface ConversionEvent {
  id: string;
  type: ConversionEventType;
  status: ConversionEventStatus;
  valueCents: number | null;
  currency: string | null;
  occurredAt: string;
  sentAt: string | null;
  lastError: string | null;
  lead: { id: string; name: string | null; normalizedPhone: string };
}

const EVENT_TYPE_LABELS: Record<ConversionEventType, string> = {
  LEAD: "Lead",
  QUALIFIED_LEAD: "Lead qualificado",
  PURCHASE: "Venda",
};

const EVENT_STATUS_LABELS: Record<ConversionEventStatus, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  RETRYING: "Tentando novamente",
  FAILED: "Falhou",
};

const EVENT_STATUS_COLORS: Record<ConversionEventStatus, string> = {
  PENDING: "text-ink-mute",
  SENT: "text-success",
  RETRYING: "text-warning",
  FAILED: "text-danger",
};

interface Ad {
  id: string;
  name: string;
  status: string;
}

interface AdSet {
  id: string;
  name: string;
  status: string;
  ads: Ad[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  lastSyncedAt: string;
  totalSpendCents: number;
  adSets: AdSet[];
}

const STATUS_LABELS: Record<MetaConnection["status"], string> = {
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  TOKEN_EXPIRED: "Token expirado",
  SYNC_FAILED: "Falha na sincronização",
};

const STATUS_COLORS: Record<MetaConnection["status"], string> = {
  CONNECTED: "text-success",
  DISCONNECTED: "text-ink-mute",
  TOKEN_EXPIRED: "text-danger",
  SYNC_FAILED: "text-danger",
};

/**
 * Uma consulta que falha não derruba a tela.
 *
 * O formulário de conexão é justamente o que resolve a maioria das falhas da
 * Meta (token vencido, conta trocada), e uma lista de campanhas que não
 * carregou tirava da pessoa o único jeito de consertar. O redirecionamento
 * de sessão encerrada continua passando (`unstable_rethrow`).
 */
async function busca<T>(caminho: string): Promise<{ ok: true; valor: T } | { ok: false }> {
  try {
    return { ok: true, valor: await apiFetch<T>(caminho) };
  } catch (erro) {
    unstable_rethrow(erro);
    return { ok: false };
  }
}

export default async function MetaIntegrationPage() {
  const leitura = await busca<MetaConnection | null>("/integrations/meta");
  const connection = leitura.ok ? leitura.valor : null;
  const [listaDeCampanhas, listaDeEventos] = connection
    ? await Promise.all([
        busca<Campaign[]>("/campaigns"),
        busca<{ items: ConversionEvent[]; total: number }>("/integrations/meta/conversion-events?limit=20"),
      ])
    : [null, null];
  const campaigns = listaDeCampanhas?.ok ? listaDeCampanhas.valor : [];
  const conversionEvents = listaDeEventos?.ok ? listaDeEventos.valor : { items: [], total: 0 };
  const desligada = connection?.status === "DISCONNECTED";
  // Só enquanto não passou: depois da hora, a frase afirmaria um bloqueio que acabou.
  const bloqueadaAte =
    connection?.limitadaAte && new Date(connection.limitadaAte).getTime() > Date.now() ? connection.limitadaAte : null;

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ink">Meta Ads</h1>

      <div className="mb-8 rounded-xl border border-line bg-panel p-6">
        {!leitura.ok ? (
          <Alert tom="warning" titulo="Não foi possível ler a conexão com a Meta agora">
            Tente de novo em alguns instantes. Se a conexão precisar ser refeita, o formulário abaixo continua
            funcionando.
          </Alert>
        ) : connection ? (
          <div className="space-y-2 text-corpo text-ink-soft">
            <p>
              <span className="font-medium">Status:</span>{" "}
              <span className={STATUS_COLORS[connection.status]}>{STATUS_LABELS[connection.status]}</span>
            </p>
            <p>
              <span className="font-medium">Ad Account:</span> {connection.adAccountId}
            </p>
            <p>
              <span className="font-medium">Última sincronização:</span>{" "}
              {connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString("pt-BR") : "Nunca"}
            </p>
            {/* Desligada, o erro de antes já não diz nada sobre a conta, e sincronizar não tem o que buscar. */}
            {desligada ? (
              <p className="text-corpo text-ink-mute">
                Para voltar a sincronizar, cole um access token abaixo e clique em Conectar.
              </p>
            ) : (
              <>
                {/* Conectada e com motivo gravado é a Meta limitando as chamadas:
                    passageiro, tenta de novo sozinho, então é aviso e não erro. */}
                {connection.lastSyncError ? (
                  <p className={connection.status === "CONNECTED" ? "text-warning" : "text-danger"}>
                    <span className="font-medium">{connection.status === "CONNECTED" ? "Aviso:" : "Erro:"}</span>{" "}
                    {connection.lastSyncError}
                  </p>
                ) : null}
                {/* A hora em que a Meta libera, e o que acontece nela: sem isso,
                    a pessoa clica em sincronizar de novo, e cada clique dentro
                    do bloqueio só o renovava. */}
                {bloqueadaAte ? (
                  <p className="text-corpo text-ink-soft">
                    A Meta libera as chamadas por volta das{" "}
                    <span className="font-medium text-ink">{horaDeBrasilia(bloqueadaAte)}</span>. A sincronização roda
                    sozinha nessa hora; não precisa clicar de novo.
                  </p>
                ) : !connection.lastSyncError && !connection.lastSyncedAt ? (
                  <p className="text-corpo text-ink-mute">
                    A primeira sincronização busca as campanhas, os anúncios e o gasto dos últimos 7 dias, e pode levar alguns
                    minutos. Se passar de 10 minutos sem mudar, clique em Sincronizar agora.
                  </p>
                ) : null}
                {connection.status === "TOKEN_EXPIRED" ? (
                  <p className="text-corpo text-ink-mute">
                    A conexão com a Meta precisa ser renovada. Reconecte com um access token válido abaixo.
                  </p>
                ) : null}
                <ConnectionActions />
              </>
            )}
          </div>
        ) : (
          <p className="text-corpo text-ink-soft">Nenhuma conta de anúncio conectada ainda.</p>
        )}
      </div>

      <ConnectMetaForm />

      {connection && !desligada ? <SecaoDaPagina connection={connection} /> : null}

      {connection ? (
        <div className="mt-8">
          <h2 className="mb-3 text-corpo font-semibold text-ink">Campanhas sincronizadas</h2>
          {listaDeCampanhas && !listaDeCampanhas.ok ? (
            <Alert tom="warning" titulo="Não foi possível carregar as campanhas agora">
              A conexão continua de pé. Tente de novo em alguns instantes.
            </Alert>
          ) : campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center text-corpo text-ink-soft">
              {desligada
                ? "Nenhuma campanha sincronizada ainda. Conecte a conta acima para buscar as campanhas."
                : "Nenhuma campanha sincronizada ainda. Clique em “Sincronizar agora”."}
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium text-ink">{campaign.name}</p>
                    <p className="text-corpo text-ink-mute">
                      {campaign.status} · Investimento (30d): {formatCentsAsBRL(campaign.totalSpendCents)}
                    </p>
                  </div>
                  {campaign.adSets.map((adSet) => (
                    <div key={adSet.id} className="ml-4 mt-2 border-l border-line/60 pl-4">
                      <p className="text-corpo text-ink-soft">
                        {adSet.name} <span className="text-ink-mute">{adSet.status}</span>
                      </p>
                      {adSet.ads.map((ad) => (
                        <p key={ad.id} className="ml-4 text-apoio text-ink-mute">
                          {ad.name} · {ad.status}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {connection ? (
        <div className="mt-10">
          <h2 className="mb-3 text-corpo font-semibold text-ink">Meta Conversions API</h2>
          <div className="mb-4 rounded-xl border border-line bg-panel p-6 text-corpo text-ink-soft">
            {connection.hasCapiAccessToken ? (
              <p>
                <span className="font-medium">Configurado</span> · Pixel ID {connection.pixelId} · enviando eventos de
                Lead, Lead qualificado e Venda automaticamente.
              </p>
            ) : (
              <p className="text-ink-soft">
                Ainda não configurado. Informe o Pixel ID e o access token do Conversions API para começar a enviar
                eventos de Lead, Lead qualificado e Venda de volta para a Meta.
              </p>
            )}
          </div>
          <ConnectMetaCapiForm />

          <div className="mt-6">
            <h3 className="mb-3 text-corpo font-semibold text-ink">Eventos enviados</h3>
            {listaDeEventos && !listaDeEventos.ok ? (
              <Alert tom="warning" titulo="Não foi possível carregar os eventos agora">
                Os envios continuam acontecendo. Tente de novo em alguns instantes.
              </Alert>
            ) : conversionEvents.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center text-corpo text-ink-soft">
                Nenhum evento registrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-panel">
                <table className="w-full text-left text-corpo">
                  <thead className="border-b border-line text-apoio uppercase text-ink-mute">
                    <tr>
                      <th className="px-4 py-2">Lead</th>
                      <th className="px-4 py-2">Evento</th>
                      <th className="px-4 py-2">Valor</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Ocorrido em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversionEvents.items.map((event) => (
                      <tr key={event.id} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2">{event.lead.name ?? event.lead.normalizedPhone}</td>
                        <td className="px-4 py-2">{EVENT_TYPE_LABELS[event.type]}</td>
                        <td className="px-4 py-2">{formatCentsAsBRL(event.valueCents)}</td>
                        <td className={`px-4 py-2 ${EVENT_STATUS_COLORS[event.status]}`}>
                          {EVENT_STATUS_LABELS[event.status]}
                          {event.lastError ? <span className="block text-apoio text-ink-mute">{event.lastError}</span> : null}
                        </td>
                        <td className="px-4 py-2 text-ink-mute">{new Date(event.occurredAt).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Hora e minuto em Brasília: o servidor roda em outro fuso, e quem lê está aqui. */
function horaDeBrasilia(instante: string): string {
  return new Date(instante).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * A Página do Facebook, para os números da tela de Insights da Meta.
 *
 * Fica aqui, ao lado da conta de anúncios, porque usa o mesmo token: o
 * usuário do sistema só precisa ter a Página entre os ativos dele e as
 * permissões de leitura. O passo a passo vai junto, porque é exatamente onde
 * quem configura vai travar.
 */
function SecaoDaPagina({ connection }: { connection: MetaConnection }) {
  const paginaId = connection.paginaId ?? null;
  return (
    <section className="mt-8 rounded-xl border border-line bg-panel p-6">
      <h2 className="text-corpo font-semibold text-ink">Página do Facebook</h2>
      <p className="mt-1 text-apoio leading-relaxed text-ink-mute">
        Os números da tela de Insights da Página: visualizações, visitas, interações, seguidores e vídeos. Eles aparecem
        no painel, na aba Página, e são lidos de hora em hora.
      </p>

      {paginaId ? (
        <div className="mt-4 space-y-1.5 text-corpo text-ink-soft">
          <p>
            <span className="font-medium">Página:</span> {connection.paginaNome ?? paginaId}
            {connection.paginaNome ? <span className="text-ink-mute"> ({paginaId})</span> : null}
          </p>
          <p>
            <span className="font-medium">Última leitura:</span>{" "}
            {connection.paginaSincronizadaEm ? new Date(connection.paginaSincronizadaEm).toLocaleString("pt-BR") : "Ainda não"}
          </p>
          {connection.paginaErro ? (
            <p className="text-danger">
              <span className="font-medium">Erro:</span> {connection.paginaErro}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <PaginaDaMetaForm paginaId={paginaId} />
      </div>

      <details className="mt-4 text-apoio leading-relaxed text-ink-mute">
        <summary className="cursor-pointer font-medium text-ink-soft">O que a Meta precisa para a leitura funcionar</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Em Configurações do negócio, Usuários do sistema, adicione a Página aos ativos do usuário do sistema, com
            permissão de ver o desempenho.
          </li>
          <li>
            Gere o token desse usuário com pages_show_list, pages_read_engagement e read_insights, além de ads_read, e
            cole na conexão acima.
          </li>
          <li>O id da Página aparece no endereço do Business, depois de asset_id=, e em Configurações da Página.</li>
        </ol>
      </details>
    </section>
  );
}
