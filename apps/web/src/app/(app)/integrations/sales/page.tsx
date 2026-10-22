import { notFound } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao";
import { SalesSources } from "./sales-sources";

export default async function Page() {
  const session = await sessaoAtual();
  // Configuração técnica, feita pela equipe Timeless (inclusive ao entrar como o cliente).
  if (!session.user.platformRole) notFound();
  const publicApi =
    process.env.PUBLIC_SALES_API_URL ??
    (process.env.PUBLIC_TRACKING_BASE_URL
      ? `${process.env.PUBLIC_TRACKING_BASE_URL.replace(/\/$/, "")}/api`
      : process.env.NEXT_PUBLIC_API_URL) ??
    "http://localhost:3001/api";
  return (
    <SalesSources
      canManage={session.capacidades.includes("apikey.manage")}
      canManageUnits={session.capacidades.includes("settings.manage")}
      endpoint={`${publicApi.replace(/\/$/, "")}/integrations/sales/events`}
    />
  );
}
