import { apiFetch } from "@/lib/api-client";
import { Card, CardHeader } from "@/components/ui/card";
import { BrandForm } from "./brand-form";
import { LogoUpload } from "./logo-upload";

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
    <div className="space-y-5">
      <Card className="p-6">
        <CardHeader
          title="Logo"
          description="Aparece no menu, no cabeçalho do relatório e onde mais a marca precisar."
          className="mb-5"
        />
        {/*
          Enviar arquivo vem primeiro. O campo de URL continua logo abaixo,
          para quem já hospeda a imagem em algum lugar, mas antes ele era a
          única forma: quem não tinha onde hospedar ficava sem logo.
        */}
        <LogoUpload organizationName={organization.name} logoUrl={organization.logoUrl} />
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Cor da marca"
          description="Pinta o menu, os botões, os gráficos e os destaques da plataforma inteira."
          className="mb-6"
        />
        <BrandForm
        organizationName={organization.name}
        logoUrl={organization.logoUrl}
        brandColor={organization.brandColor}
        />
      </Card>
    </div>
  );
}
