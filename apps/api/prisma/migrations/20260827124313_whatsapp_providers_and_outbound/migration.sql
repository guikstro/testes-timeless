-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('CLOUD_API', 'EVOLUTION');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
-- Safe inside a transaction on PostgreSQL 12+ as long as the new value is not
-- referenced in this same migration (it isn't) — see the Postgres docs on
-- ALTER TYPE ... ADD VALUE.
ALTER TYPE "WhatsAppConnectionStatus" ADD VALUE 'PENDING_QR';

-- AlterTable
-- external_id becomes nullable: an OUTBOUND message has no provider id until
-- the provider accepts it. Existing INBOUND rows keep their values and the
-- unique index still enforces idempotency (Postgres allows multiple NULLs).
ALTER TABLE "messages" ADD COLUMN     "outbound_status" "OutboundStatus",
ADD COLUMN     "send_error" TEXT,
ALTER COLUMN "external_id" DROP NOT NULL;

-- AlterTable
-- Every pre-existing connection was created by the Fase 3 Cloud API flow, so
-- the CLOUD_API default backfills them correctly and phone_number_id stays
-- populated for exactly those rows.
ALTER TABLE "whatsapp_connections" ADD COLUMN     "instance_name" TEXT,
ADD COLUMN     "provider" "WhatsAppProvider" NOT NULL DEFAULT 'CLOUD_API',
ALTER COLUMN "phone_number_id" DROP NOT NULL,
ALTER COLUMN "display_phone_number" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_instance_name_key" ON "whatsapp_connections"("instance_name");
