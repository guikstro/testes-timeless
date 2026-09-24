-- A contagem de conversas que a Meta diz ter iniciado, ao lado da nossa.
-- Só acréscimos, todos opcionais: as linhas existentes ficam com null, que
-- quer dizer "não pedido ainda", e a próxima sincronização preenche a janela
-- recente.
ALTER TABLE "ad_spend" ADD COLUMN "conversas_iniciadas" INTEGER;
ALTER TABLE "ad_insights" ADD COLUMN "conversas_iniciadas" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN "criada_na_plataforma_em" TIMESTAMP(3);
