-- Desempenho diário por anúncio.
--
-- A hierarquia já era sincronizada (campanha, conjunto e anúncio), e o clique
-- rastreado já guarda o id do anúncio: o sistema já sabia qual criativo trouxe
-- cada lead. Faltava o custo nesse nível, e sem ele dá para dizer "este
-- anúncio trouxe doze leads" mas não quanto cada um custou.
--
-- Impressões e cliques vêm na mesma chamada e separam dois diagnósticos que o
-- total esconde: o anúncio não está sendo visto, ou está sendo visto e
-- ninguém clica.
CREATE TABLE "ad_insights" (
  "id"          TEXT NOT NULL,
  "ad_id"       TEXT NOT NULL,
  "date"        DATE NOT NULL,
  "spend_cents" INTEGER NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks"      INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ad_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_insights_ad_id_date_key" ON "ad_insights"("ad_id", "date");
CREATE INDEX "ad_insights_date_idx" ON "ad_insights"("date");

ALTER TABLE "ad_insights"
  ADD CONSTRAINT "ad_insights_ad_id_fkey"
  FOREIGN KEY ("ad_id") REFERENCES "ads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
