-- Registro de toda escrita que o produto faz na conta de anúncios.
-- Ver o comentário do model `MudancaNoAnuncio` no schema.
CREATE TYPE "NivelDoAnuncio" AS ENUM ('CAMPANHA', 'CONJUNTO', 'ANUNCIO');
CREATE TYPE "AcaoNoAnuncio" AS ENUM ('PAUSAR', 'ATIVAR', 'ORCAMENTO_DIARIO');

CREATE TABLE "mudancas_no_anuncio" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    -- Nulo só para mudança feita pelo próprio sistema. A exclusão do usuário
    -- anula a autoria mas preserva a linha: apagar a conta de quem agiu não
    -- pode apagar o registro de que a ação aconteceu.
    "user_id" TEXT,
    "nivel" "NivelDoAnuncio" NOT NULL,
    "external_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "acao" "AcaoNoAnuncio" NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "aplicado_em" TIMESTAMP(3),
    "erro" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mudancas_no_anuncio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mudancas_no_anuncio_organization_id_created_at_idx"
    ON "mudancas_no_anuncio"("organization_id", "created_at");

ALTER TABLE "mudancas_no_anuncio" ADD CONSTRAINT "mudancas_no_anuncio_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mudancas_no_anuncio" ADD CONSTRAINT "mudancas_no_anuncio_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
