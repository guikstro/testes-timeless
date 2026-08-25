-- CreateEnum
CREATE TYPE "AttributionMethod" AS ENUM ('CTWA_REFERRAL', 'TRACKING_LINK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AttributionConfidence" AS ENUM ('HIGH', 'NONE');

-- AlterTable
ALTER TABLE "tracking_clicks" ADD COLUMN     "attribution_token" TEXT;

-- CreateTable
CREATE TABLE "attributions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "method" "AttributionMethod" NOT NULL,
    "confidence" "AttributionConfidence" NOT NULL,
    "tracking_click_id" TEXT,
    "evidence" JSONB,
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attributions_lead_id_key" ON "attributions"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "attributions_tracking_click_id_key" ON "attributions"("tracking_click_id");

-- CreateIndex
CREATE INDEX "attributions_organization_id_idx" ON "attributions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_clicks_attribution_token_key" ON "tracking_clicks"("attribution_token");

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_tracking_click_id_fkey" FOREIGN KEY ("tracking_click_id") REFERENCES "tracking_clicks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

