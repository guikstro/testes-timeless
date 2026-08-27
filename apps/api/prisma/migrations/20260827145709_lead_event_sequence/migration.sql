-- AlterTable
-- Contador monotônico para desempatar a linha do tempo do lead: vários
-- eventos de uma mesma mensagem compartilham o occurred_at dela e muitas
-- vezes também o created_at (precisão de milissegundos), o que deixava a
-- ordem por conta do Postgres — a venda chegava a aparecer antes da mensagem
-- que a originou.
--
-- BIGSERIAL numera as linhas existentes na ordem física atual, que é a ordem
-- de inserção — então o histórico já gravado também fica coerente.
ALTER TABLE "lead_events" ADD COLUMN     "sequence" BIGSERIAL NOT NULL;
