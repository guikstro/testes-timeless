-- Troca de e-mail passa a exigir confirmação no endereço novo.
--
-- Antes o endereço trocava na hora. Um erro de digitação virava o login: a
-- pessoa não conseguia mais entrar, e a recuperação de senha ia para uma caixa
-- que não existe. O endereço pedido fica aqui, e não em `users`, porque
-- enquanto não for confirmado ele não é atributo da conta, é só um pedido.
CREATE TABLE "email_change_tokens" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "new_email"  TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_change_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_change_tokens_token_hash_key" ON "email_change_tokens"("token_hash");
CREATE INDEX "email_change_tokens_user_id_idx" ON "email_change_tokens"("user_id");

ALTER TABLE "email_change_tokens"
  ADD CONSTRAINT "email_change_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
