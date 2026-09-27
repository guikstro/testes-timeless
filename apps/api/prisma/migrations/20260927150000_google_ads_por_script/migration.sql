-- Google Ads pelo script da própria conta. Só acréscimos, todos opcionais.
CREATE TABLE "google_ads_conexoes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "chave_hash" TEXT NOT NULL,
    "customer_id" TEXT,
    "nome_da_conta" TEXT,
    "moeda" TEXT,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_envio_em" TIMESTAMP(3),

    CONSTRAINT "google_ads_conexoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_ads_conexoes_organization_id_key" ON "google_ads_conexoes"("organization_id");
CREATE UNIQUE INDEX "google_ads_conexoes_chave_hash_key" ON "google_ads_conexoes"("chave_hash");
-- Mesmo cuidado de sessoes_whatsapp: o Supabase publica o schema public pela
-- Data API, e sem RLS esta tabela ficaria legível por ela. A API do sistema
-- entra como dona das tabelas e não é afetada.
ALTER TABLE "google_ads_conexoes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "google_ads_conexoes" ADD CONSTRAINT "google_ads_conexoes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os números do dia como a plataforma conta.
ALTER TABLE "ad_spend" ADD COLUMN "impressoes" INTEGER;
ALTER TABLE "ad_spend" ADD COLUMN "cliques" INTEGER;
ALTER TABLE "ad_spend" ADD COLUMN "conversoes_na_plataforma" DOUBLE PRECISION;
ALTER TABLE "ad_spend" ADD COLUMN "valor_conversoes_centavos" INTEGER;

ALTER TABLE "campaigns" ADD COLUMN "orcamento_diario_centavos" INTEGER;
