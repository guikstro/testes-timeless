-- CreateEnum
CREATE TYPE "ConversionEventType" AS ENUM ('LEAD', 'QUALIFIED_LEAD', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ConversionEventStatus" AS ENUM ('PENDING', 'SENT', 'RETRYING', 'FAILED');

-- AlterTable
ALTER TABLE "meta_connections" ADD COLUMN     "capi_access_token_encrypted" TEXT,
ADD COLUMN     "capi_configured_at" TIMESTAMP(3),
ADD COLUMN     "pixel_id" TEXT;

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" "ConversionEventType" NOT NULL,
    "status" "ConversionEventStatus" NOT NULL DEFAULT 'PENDING',
    "value_cents" INTEGER,
    "currency" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversion_events_organization_id_idx" ON "conversion_events"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_lead_id_type_key" ON "conversion_events"("lead_id", "type");

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
