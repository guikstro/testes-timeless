-- Uma conversa por (lead, conexão).
--
-- A ingestão sempre tratou isso como verdade: ela procura a conversa, e se a
-- criação falhar assume que perdeu uma corrida e reconsulta. Só que a
-- restrição não existia, então duas mensagens simultâneas do mesmo lead não
-- colidiam, criavam duas conversas, e a partir dali a "última mensagem" da
-- lista passava a depender de qual das duas o Postgres devolvesse primeiro.

-- As duplicatas que já existirem são dobradas na conversa mais antiga, que é
-- a que tem o histórico de verdade. As mensagens vão junto: apagar a conversa
-- sem mover as mensagens as levaria pelo cascade.
WITH ordenadas AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY lead_id, whatsapp_connection_id ORDER BY started_at, id
         ) AS mantida
  FROM conversations
)
UPDATE messages
SET conversation_id = ordenadas.mantida
FROM ordenadas
WHERE messages.conversation_id = ordenadas.id
  AND ordenadas.id <> ordenadas.mantida;

WITH ordenadas AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY lead_id, whatsapp_connection_id ORDER BY started_at, id
         ) AS mantida
  FROM conversations
)
DELETE FROM conversations
USING ordenadas
WHERE conversations.id = ordenadas.id
  AND ordenadas.id <> ordenadas.mantida;

CREATE UNIQUE INDEX "conversations_lead_id_whatsapp_connection_id_key"
  ON "conversations" ("lead_id", "whatsapp_connection_id");
