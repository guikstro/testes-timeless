-- `organization_id` em conversas e eventos de lead vira vínculo de verdade.
--
-- As duas colunas existiam soltas, sem chave estrangeira. O vínculo existia
-- só na cabeça de quem escreveu o código: nada impedia uma linha de apontar
-- para uma organização que não existe, e uma consulta escopada por essa
-- coluna devolveria dado errado sem nenhum erro aparecer.
--
-- Qualquer linha órfã é removida antes, senão a restrição não entra. Numa
-- base íntegra isto não apaga nada.
DELETE FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.organization_id);

DELETE FROM lead_events e
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = e.organization_id);

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_events"
  ADD CONSTRAINT "lead_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A coluna era usada em filtro sem índice atrás dela.
CREATE INDEX "lead_events_organization_id_occurred_at_idx"
  ON "lead_events" ("organization_id", "occurred_at");
