-- Segundo fator em TOTP. Ver os comentários dos models no schema.
CREATE TABLE "user_mfa" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    -- Nulo = gerado e ainda não provado. O login NÃO pede código nesse estado:
    -- exigir um fator que a pessoa não terminou de configurar tranca a conta.
    "confirmado_em" TIMESTAMP(3),
    "ultimo_passo_usado" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_mfa_user_id_key" ON "user_mfa"("user_id");
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    -- Marcado, não apagado: a pessoa precisa ver que restam três de dez.
    "usado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
