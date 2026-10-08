import { sessaoAtual } from "@/lib/sessao";
import { SalesWorkspace } from "./sales-workspace";
import { ExigeArea } from "@/components/exige-area";

export default async function SalesPage() {
  const session = await sessaoAtual();
  return (
    <ExigeArea caminho="/leads">
      <SalesWorkspace
        canManage={session.capacidades.includes("lead.manage")}
        canAnalyze={session.capacidades.includes("analytics.read")}
      />
    </ExigeArea>
  );
}
