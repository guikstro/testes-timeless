-- Sessões: a identidade estável que atravessa as renovações de token.
-- Ver o comentário do model `Sessao` no schema.
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_atividade_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip" TEXT,
    "impersonando" BOOLEAN NOT NULL DEFAULT false,
    "encerrada_em" TIMESTAMP(3),
    "motivo_do_encerramento" TEXT,
    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessoes_user_id_encerrada_em_idx" ON "sessoes"("user_id", "encerrada_em");
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nulo nas linhas existentes: a primeira renovação de cada uma cria a sessão,
-- então ninguém que já estava logado é expulso por esta migração.
ALTER TABLE "refresh_tokens" ADD COLUMN "sessao_id" TEXT;
CREATE INDEX "refresh_tokens_sessao_id_idx" ON "refresh_tokens"("sessao_id");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessao_id_fkey"
  FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
