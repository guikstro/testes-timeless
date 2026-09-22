-- A saúde da conta de anúncios, como a Meta a reporta.
-- Tudo anulável de propósito: nulo é "nunca foi lido", que não é zero.
ALTER TABLE "meta_connections"
  ADD COLUMN "account_status"     INTEGER,
  ADD COLUMN "spend_cap_cents"    INTEGER,
  ADD COLUMN "amount_spent_cents" INTEGER,
  ADD COLUMN "balance_cents"      INTEGER,
  ADD COLUMN "currency"           TEXT,
  ADD COLUMN "account_name"       TEXT,
  ADD COLUMN "health_synced_at"   TIMESTAMP(3);
