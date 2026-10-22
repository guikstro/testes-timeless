-- Marca a empresa de exemplo usada nas demonstrações de venda.
ALTER TABLE "organizations" ADD COLUMN "demonstracao" BOOLEAN NOT NULL DEFAULT false;
