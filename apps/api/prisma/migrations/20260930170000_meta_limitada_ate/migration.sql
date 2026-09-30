-- Até quando a Meta bloqueou as chamadas da conta por excesso de pedidos.
-- Só acrescenta: nula para todas as conexões que já existem.
ALTER TABLE "meta_connections" ADD COLUMN "limitada_ate" TIMESTAMP(3);
