-- O foco de cada cliente: leads, presença local no Google ou os dois.
CREATE TYPE "FocoDoCliente" AS ENUM ('LEADS', 'PRESENCA_LOCAL', 'AMBOS');
ALTER TABLE "organizations" ADD COLUMN "foco" "FocoDoCliente" NOT NULL DEFAULT 'LEADS';

-- Qual versão do script do Google Ads enviou por último.
ALTER TABLE "google_ads_conexoes" ADD COLUMN "versao_do_script" INTEGER;
ALTER TABLE "google_ads_conexoes" ADD COLUMN "partes_do_script" JSONB;

-- Métricas de presença local por dia, de qualquer fonte.
CREATE TYPE "FonteDeMetricaLocal" AS ENUM ('GOOGLE_ADS', 'PERFIL_DA_EMPRESA');

CREATE TABLE "metricas_locais" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "fonte" "FonteDeMetricaLocal" NOT NULL,
    "metrica" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metricas_locais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metricas_locais_organization_id_fonte_metrica_escopo_dia_key" ON "metricas_locais"("organization_id", "fonte", "metrica", "escopo", "dia");
CREATE INDEX "metricas_locais_organization_id_dia_idx" ON "metricas_locais"("organization_id", "dia");

ALTER TABLE "metricas_locais" ADD CONSTRAINT "metricas_locais_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "metricas_locais" ENABLE ROW LEVEL SECURITY;
