import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { BrandForm } from "./brand-form";

interface Organization {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

/**
 * Aparência sai da primeira aba de propósito.
 *
 * Logo e cor se definem uma vez e quase não se voltam a tocar, enquanto os
 * gatilhos e a equipe mudam toda semana. Abrir as configurações no que se usa
 * mais poupa um clique por visita a quem trabalha aqui todo dia.
 */
export async function AbaAparencia() {
  const organization = await apiFetch<Organization>("/organizations/current");

  return (
    <Card className="p-6">
      <CardHeader
        title="Identidade da empresa"
        description="A logo e a cor aparecem no menu, nos botões, nos gráficos e nos destaques da plataforma."
        className="mb-6"
      />
      <BrandForm
        organizationName={organization.name}
        logoUrl={organization.logoUrl}
        brandColor={organization.brandColor}
      />
    </Card>
  );
}
