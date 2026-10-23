import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { PerfilDoNegocio } from "@/lib/perfil-do-negocio";
import { PerfilDoNegocioForm } from "./perfil-do-negocio-form";

export async function AbaNegocio({ podeEditar }: { podeEditar: boolean }) {
  const { perfil } = await apiFetch<{ perfil: PerfilDoNegocio | null }>("/organizations/current/perfil");
  return (
    <Card className="p-6">
      <CardHeader
        title="Perfil do negócio"
        description="O contexto que a análise das campanhas considera: o que o negócio é, o que quer e quanto vale cada venda."
        className="mb-6"
      />
      <PerfilDoNegocioForm perfil={perfil} podeEditar={podeEditar} />
    </Card>
  );
}
