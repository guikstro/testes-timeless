-- Identificador LID do WhatsApp, aprendido quando o contato escreve. Permite ligar
-- ao lead a resposta que a equipe dá pelo celular, que só traz o LID.
ALTER TABLE "leads" ADD COLUMN "whatsapp_lid" TEXT;
CREATE INDEX "leads_organization_id_whatsapp_lid_idx" ON "leads"("organization_id", "whatsapp_lid");
