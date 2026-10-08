-- Se a venda detectada na conversa confirma sozinha ou espera revisão.
-- Ligada para todos, que é o comportamento que os clientes já tinham.
ALTER TABLE "organizations" ADD COLUMN "confirma_venda_da_conversa" BOOLEAN NOT NULL DEFAULT true;

-- Durante o deploy, a versão anterior ainda atende por alguns instantes depois
-- da migração e grava eventos da Meta sem `deduplication_key`, que passou a ser
-- obrigatória. Sem isto esses eventos falhavam. A chave preenchida é a mesma
-- que a migração anterior deu aos eventos antigos (lead:tipo), então a
-- deduplicação daquela versão continua valendo.
CREATE OR REPLACE FUNCTION conversion_events_chave_legada() RETURNS trigger AS $$
BEGIN
  IF NEW."deduplication_key" IS NULL THEN
    NEW."deduplication_key" := NEW."lead_id" || ':' || NEW."type"::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversion_events_chave_legada
BEFORE INSERT ON "conversion_events"
FOR EACH ROW EXECUTE FUNCTION conversion_events_chave_legada();
