-- A verba combinada com o cliente.
--
-- Declarada no sistema, e não lida da Meta. A API dela expõe com segurança o
-- teto da conta e o total já gasto, mas o saldo pré-pago das contas que
-- recebem crédito por PIX ou boleto não sai limpo para todo tipo de conta. E
-- o número que a agência precisa mostrar costuma ser o combinado com o
-- cliente, que vale também para o Google e para campanha lançada à mão.
--
-- `ends_on` é opcional porque as duas formas reais são diferentes: verba
-- mensal tem fim de mês, e depósito de crédito vale até acabar.
CREATE TABLE "budgets" (
  "id"              TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "starts_on"       DATE NOT NULL,
  "ends_on"         DATE,
  "amount_cents"    INTEGER NOT NULL,
  "label"           TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budgets_organization_id_starts_on_idx" ON "budgets"("organization_id", "starts_on");

ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
