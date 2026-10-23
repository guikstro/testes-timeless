-- O contexto do negócio de cada cliente, para a análise da IA. Tudo opcional.
CREATE TYPE "ObjetivoDoNegocio" AS ENUM ('VENDAS', 'PRESENCA_LOCAL', 'AUDIENCIA');

CREATE TABLE "perfis_do_negocio" (
    "organization_id" TEXT NOT NULL,
    "tipo_de_negocio" TEXT,
    "oferta" TEXT,
    "objetivo_principal" "ObjetivoDoNegocio",
    "objetivos_secundarios" "ObjetivoDoNegocio"[] DEFAULT ARRAY[]::"ObjetivoDoNegocio"[],
    "publico" TEXT,
    "regiao" TEXT,
    "definicao_de_sucesso" TEXT,
    "meta_vendas_por_mes" INTEGER,
    "meta_custo_por_venda_centavos" INTEGER,
    "meta_receita_mensal_centavos" INTEGER,
    "ciclo_de_venda_dias" INTEGER,
    "margem_percentual" INTEGER,
    "custo_medio_centavos" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "atualizado_por_id" TEXT,

    CONSTRAINT "perfis_do_negocio_pkey" PRIMARY KEY ("organization_id")
);

ALTER TABLE "perfis_do_negocio" ADD CONSTRAINT "perfis_do_negocio_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
