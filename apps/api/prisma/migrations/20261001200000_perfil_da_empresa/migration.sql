-- O Perfil da Empresa no Google: a conta Google da equipe, que lê os perfis
-- de todos os clientes, e o local escolhido para cada cliente. Só acrescenta.
CREATE TABLE "contas_google_da_equipe" (
    "id" TEXT NOT NULL DEFAULT 'equipe',
    "email" TEXT,
    "refresh_token_encrypted" TEXT NOT NULL,
    "escopos" TEXT NOT NULL,
    "conectada_por_id" TEXT,
    "conectada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erro" TEXT,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_google_da_equipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locais_do_perfil" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "local_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "numeros_ate" DATE,
    "sincronizado_em" TIMESTAMP(3),
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locais_do_perfil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locais_do_perfil_local_id_key" ON "locais_do_perfil"("local_id");
CREATE INDEX "locais_do_perfil_organization_id_idx" ON "locais_do_perfil"("organization_id");

ALTER TABLE "locais_do_perfil" ADD CONSTRAINT "locais_do_perfil_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Como toda tabela nova: fora do alcance da Data API do Supabase.
ALTER TABLE "contas_google_da_equipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locais_do_perfil" ENABLE ROW LEVEL SECURITY;
