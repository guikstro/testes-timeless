-- Leads que já foram respondidos pela equipe e ficaram em "Novo".
--
-- Antes de as respostas dadas no celular serem capturadas, só a resposta
-- enviada pelo sistema tirava o lead de Novo. Quem atendia pelo celular
-- deixava o quadro cheio de leads "novos" que já estavam em conversa. Agora
-- que essas respostas entram (inclusive as recuperadas do histórico), o lead
-- passa para Em atendimento como teria passado na hora, com o evento de
-- início datado da primeira resposta de verdade.
--
-- Só mexe em quem está em Novo e não foi descartado; rodar de novo não faz
-- nada, porque depois disto ninguém mais satisfaz a condição.
WITH respondidos AS (
  SELECT l.id AS lead_id,
         l.organization_id,
         MIN(m.timestamp) AS primeira_resposta
  FROM leads l
  JOIN conversations c ON c.lead_id = l.id
  JOIN messages m ON m.conversation_id = c.id
  WHERE l.status = 'NEW'
    AND l.disqualified_at IS NULL
    AND m.direction = 'OUTBOUND'
    AND (m.outbound_status IS NULL OR m.outbound_status = 'SENT')
  GROUP BY l.id, l.organization_id
),
movidos AS (
  UPDATE leads l
  SET status = 'IN_PROGRESS',
      em_atendimento_at = r.primeira_resposta
  FROM respondidos r
  WHERE l.id = r.lead_id
    AND l.status = 'NEW'
  RETURNING l.id, l.organization_id, r.primeira_resposta
)
INSERT INTO lead_events (id, organization_id, lead_id, type, metadata, occurred_at)
SELECT gen_random_uuid()::text,
       organization_id,
       id,
       'ATTENDANCE_STARTED',
       '{"origem": "leads respondidos antes da captura do celular"}'::jsonb,
       primeira_resposta
FROM movidos;
