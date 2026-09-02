import { apiFetch } from "@/lib/api-client";
import { PaginaDeNotificacoes, TipoDeNotificacao } from "@/lib/notifications/tipos";
import { NotificationsView } from "./notifications-view";

/** Os mesmos tipos que a API aceita, para um filtro inválido na URL ser ignorado. */
const TIPOS: TipoDeNotificacao[] = [
  "lead.created",
  "lead.qualified",
  "lead.won",
  "lead.stage_changed",
  "message.received",
  "message.failed",
];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; naoLidas?: string }>;
}) {
  const params = await searchParams;
  const tipo = TIPOS.includes(params.tipo as TipoDeNotificacao) ? (params.tipo as TipoDeNotificacao) : null;
  const naoLidas = params.naoLidas === "1";

  const busca = new URLSearchParams();
  if (tipo) busca.set("tipo", tipo);
  if (naoLidas) busca.set("naoLidas", "true");

  const pagina = await apiFetch<PaginaDeNotificacoes>(
    `/notifications${busca.toString() ? `?${busca.toString()}` : ""}`,
  );

  return <NotificationsView pagina={pagina} tipo={tipo} naoLidas={naoLidas} />;
}
