-- Conversões que o script do Google Ads já subiu, para cada uma ir uma vez só.
CREATE TABLE "google_conversoes_enviadas" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "enviada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_conversoes_enviadas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_conversoes_enviadas_organization_id_chave_key" ON "google_conversoes_enviadas"("organization_id", "chave");
