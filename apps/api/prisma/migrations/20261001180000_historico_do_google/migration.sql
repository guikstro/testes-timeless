-- Desde quando a conta tem dado do Google, e se o histórico de 13 meses já
-- chegou. Só acrescenta: nulo para as conexões que já existem.
ALTER TABLE "google_ads_conexoes" ADD COLUMN "coberto_desde" DATE;
ALTER TABLE "google_ads_conexoes" ADD COLUMN "historico_completo_em" TIMESTAMP(3);
