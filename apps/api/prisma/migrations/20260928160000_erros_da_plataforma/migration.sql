-- Erros da plataforma, agrupados por assinatura, para a tela de saúde.
CREATE TABLE "erros_da_plataforma" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assinatura" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "detalhe" TEXT,
    "contexto" JSONB,
    "ocorrencias" INTEGER NOT NULL DEFAULT 1,
    "primeira_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido_em" TIMESTAMP(3),

    CONSTRAINT "erros_da_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "erros_da_plataforma_assinatura_key" ON "erros_da_plataforma"("assinatura");
CREATE INDEX "erros_da_plataforma_ultima_em_idx" ON "erros_da_plataforma"("ultima_em");

-- Como as outras tabelas sensíveis: fora da API de dados do Supabase.
ALTER TABLE "erros_da_plataforma" ENABLE ROW LEVEL SECURITY;
