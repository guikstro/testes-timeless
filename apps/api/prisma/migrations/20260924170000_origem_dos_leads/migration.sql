-- Quem vira lead quando escreve no WhatsApp conectado. Só acréscimos: leads
-- que já existem não são tocados, a regra vale para os próximos contatos.
CREATE TYPE "OrigemDosLeads" AS ENUM ('TRAFEGO_PAGO', 'RASTREADO', 'TODOS');

ALTER TABLE "organizations" ADD COLUMN "origem_dos_leads" "OrigemDosLeads" NOT NULL DEFAULT 'TRAFEGO_PAGO';

-- Só a contagem do que ficou de fora, sem telefone nem texto.
CREATE TABLE "mensagens_fora_da_regra" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mensagens_fora_da_regra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mensagens_fora_da_regra_organization_id_dia_key" ON "mensagens_fora_da_regra"("organization_id", "dia");

ALTER TABLE "mensagens_fora_da_regra" ADD CONSTRAINT "mensagens_fora_da_regra_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
