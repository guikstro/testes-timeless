-- Quando o histórico da conversa foi pedido ao celular, para pedir uma vez só.
ALTER TABLE "conversations" ADD COLUMN "history_requested_at" TIMESTAMP(3);
