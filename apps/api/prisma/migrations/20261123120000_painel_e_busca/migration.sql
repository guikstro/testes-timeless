-- Painel montado pelo cliente (arrastar e soltar)
CREATE TABLE "paineis_personalizados" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "blocos" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paineis_personalizados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "paineis_personalizados_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "paineis_personalizados_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "paineis_personalizados_organization_id_user_id_key" ON "paineis_personalizados"("organization_id", "user_id");

-- Busca em texto (barra de perguntas): índice de texto em português nas mensagens.
CREATE INDEX "messages_texto_busca_idx" ON "messages" USING GIN (to_tsvector('portuguese', coalesce("text", '')));
