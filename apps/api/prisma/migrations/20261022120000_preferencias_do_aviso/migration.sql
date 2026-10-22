-- Quais avisos cada aparelho quer receber. Ligados por padrão, como já era.
ALTER TABLE "push_subscriptions" ADD COLUMN "avisa_lead_novo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "push_subscriptions" ADD COLUMN "avisa_mensagem" BOOLEAN NOT NULL DEFAULT true;
