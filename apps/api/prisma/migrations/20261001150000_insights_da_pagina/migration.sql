-- A Página do Facebook da conta, para os Insights da Página. Só acrescenta:
-- nula para todas as conexões que já existem.
ALTER TABLE "meta_connections" ADD COLUMN "pagina_id" TEXT;
ALTER TABLE "meta_connections" ADD COLUMN "pagina_nome" TEXT;
ALTER TABLE "meta_connections" ADD COLUMN "pagina_sincronizada_em" TIMESTAMP(3);
ALTER TABLE "meta_connections" ADD COLUMN "pagina_erro" TEXT;

-- Os números da Página, um por dia e por métrica.
CREATE TABLE "metricas_da_pagina" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "pagina_id" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metricas_da_pagina_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metricas_da_pagina_organization_id_pagina_id_metrica_dia_key" ON "metricas_da_pagina"("organization_id", "pagina_id", "metrica", "dia");
CREATE INDEX "metricas_da_pagina_organization_id_dia_idx" ON "metricas_da_pagina"("organization_id", "dia");

ALTER TABLE "metricas_da_pagina" ADD CONSTRAINT "metricas_da_pagina_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Como toda tabela nova: fora do alcance da Data API do Supabase.
ALTER TABLE "metricas_da_pagina" ENABLE ROW LEVEL SECURITY;
