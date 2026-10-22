-- O resumo da semana, ligado por cliente. Desligado para todos de início.
ALTER TABLE "organizations" ADD COLUMN "relatorio_semanal" BOOLEAN NOT NULL DEFAULT false;
