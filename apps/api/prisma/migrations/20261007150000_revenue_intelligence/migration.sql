BEGIN;
-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('POSSIBLE', 'PROBABLE', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleConfirmationSource" AS ENUM ('CONVERSATION', 'CRM', 'PAYMENT', 'ERP', 'ECOMMERCE', 'MANUAL', 'API');

-- CreateEnum
CREATE TYPE "SaleEvidenceType" AS ENUM ('MESSAGE', 'SALE_INTENT', 'PAYMENT_INTENT', 'CRM_WON', 'CRM_LOST', 'PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED', 'ERP_ORDER', 'ECOMMERCE_ORDER', 'MANUAL_CONFIRMATION', 'MANUAL_REJECTION', 'EXTERNAL_API', 'CANCELLATION', 'LEGACY_IMPORT');

-- CreateEnum
CREATE TYPE "ConversationCoverage" AS ENUM ('COMPLETE', 'PARTIAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('TIMELESS', 'WHATSAPP_DEVICE', 'CRM', 'PROVIDER', 'IMPORT', 'OTHER');

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_lead_id_fkey";

-- DropIndex
DROP INDEX "sales_lead_id_key";

-- DropIndex
DROP INDEX "conversion_events_lead_id_type_key";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "email" TEXT,
ADD COLUMN     "unit_id" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "coverage" "ConversationCoverage" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "author" TEXT,
ADD COLUMN     "source" "MessageSource" NOT NULL DEFAULT 'PROVIDER';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "attribution_snapshot" JSONB,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "confirmation_source" "SaleConfirmationSource" NOT NULL DEFAULT 'CONVERSATION',
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "conflicts" JSONB,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BRL',
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "customer_phone" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "loss_reason" TEXT,
ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "occurred_at" TIMESTAMP(3),
ADD COLUMN     "product" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'POSSIBLE',
ADD COLUMN     "unit_id" TEXT,
ALTER COLUMN "lead_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "conversion_events" ADD COLUMN     "deduplication_key" TEXT,
ADD COLUMN     "sale_id" TEXT;

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_sources" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "SaleConfirmationSource" NOT NULL DEFAULT 'API',
    "credential_hash" TEXT,
    "credential_prefix" TEXT,
    "revoked_at" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_evidence" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "type" "SaleEvidenceType" NOT NULL,
    "source" "SaleConfirmationSource" NOT NULL,
    "event_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "actor_id" TEXT,
    "status" "SaleStatus" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "value_cents" INTEGER,
    "currency" TEXT NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- Preserve historical rows and their original attribution/value. Legacy imports are
-- explicitly marked: preservation is not a claim of independent payment verification.
UPDATE "sales" s SET
  "status" = 'CONFIRMED',
  "confirmed_at" = s."detected_at",
  "occurred_at" = s."detected_at",
  "currency" = o."currency",
  "confirmation_source" = CASE WHEN s."classifier_type" = 'MANUAL' THEN 'MANUAL'::"SaleConfirmationSource" ELSE 'CONVERSATION'::"SaleConfirmationSource" END,
  "attribution_snapshot" = (SELECT to_jsonb(a) FROM "attributions" a WHERE a."lead_id" = s."lead_id" LIMIT 1)
FROM "organizations" o WHERE o.id = s."organization_id";

INSERT INTO "sale_evidence" ("id", "organization_id", "sale_id", "type", "source", "event_key", "fingerprint", "status", "value_cents", "currency", "payload", "occurred_at")
SELECT 'legacy-' || id, organization_id, id, 'LEGACY_IMPORT', confirmation_source,
  'legacy:' || id, 'legacy:' || id, 'CONFIRMED', amount_cents, currency,
  jsonb_build_object('legacy', true, 'classifierType', classifier_type, 'evidenceMessageId', evidence_message_id,
    'note', 'Preservado do modelo anterior; não é nova confirmação independente.'), detected_at
FROM "sales";

-- Keep the exact event id previously sent to Meta to avoid historical duplicates.
UPDATE "conversion_events" SET "deduplication_key" = "lead_id" || ':' || "type"::text;
UPDATE "conversion_events" e SET "sale_id" = s.id FROM "sales" s
WHERE e."type" = 'PURCHASE' AND e."lead_id" = s."lead_id" AND e."organization_id" = s."organization_id";
ALTER TABLE "conversion_events" ALTER COLUMN "deduplication_key" SET NOT NULL;
UPDATE "messages" SET "source" = 'TIMELESS' WHERE "direction" = 'OUTBOUND';

-- CreateIndex
CREATE UNIQUE INDEX "units_organization_id_code_key" ON "units"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_sources_credential_hash_key" ON "sales_sources"("credential_hash");

-- CreateIndex
CREATE INDEX "sales_sources_organization_id_idx" ON "sales_sources"("organization_id");

-- CreateIndex
CREATE INDEX "sale_evidence_sale_id_occurred_at_idx" ON "sale_evidence"("sale_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_evidence_organization_id_event_key_key" ON "sale_evidence"("organization_id", "event_key");

-- CreateIndex
CREATE INDEX "external_identities_organization_id_lead_id_idx" ON "external_identities"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_source_id_external_id_key" ON "external_identities"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "sales_organization_id_status_occurred_at_idx" ON "sales"("organization_id", "status", "occurred_at");

-- CreateIndex
CREATE INDEX "sales_lead_id_idx" ON "sales"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_source_id_external_id_key" ON "sales"("source_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_deduplication_key_key" ON "conversion_events"("deduplication_key");

-- CreateIndex
CREATE INDEX "conversion_events_lead_id_type_idx" ON "conversion_events"("lead_id", "type");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sales_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_sources" ADD CONSTRAINT "sales_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_sources" ADD CONSTRAINT "sales_sources_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_evidence" ADD CONSTRAINT "sale_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_evidence" ADD CONSTRAINT "sale_evidence_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sales_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- New business tables follow the existing server-only database access model.
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ADD CONSTRAINT "sales_value_nonnegative" CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0) NOT VALID;
ALTER TABLE "sale_evidence" ADD CONSTRAINT "sale_evidence_value_nonnegative" CHECK ("value_cents" IS NULL OR "value_cents" >= 0);

ALTER TABLE "sale_evidence" ADD COLUMN "sequence" SERIAL NOT NULL, ADD COLUMN "source_id" TEXT;
CREATE TABLE "external_deals" (
  "id" TEXT PRIMARY KEY, "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_id" TEXT NOT NULL REFERENCES "sales_sources"("id") ON DELETE CASCADE,
  "external_id" TEXT NOT NULL, "sale_id" TEXT NOT NULL REFERENCES "sales"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL, "provider" TEXT NOT NULL, "pipeline" TEXT, "stage" TEXT,
  "owner_external_id" TEXT, "owner_name" TEXT, "value_cents" INTEGER, "currency" TEXT NOT NULL,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "external_deals_source_id_external_id_key" ON "external_deals" ("source_id", "external_id");
CREATE INDEX "external_deals_organization_id_sale_id_idx" ON "external_deals" ("organization_id", "sale_id");
ALTER TABLE "external_deals" ENABLE ROW LEVEL SECURITY;
COMMIT;
