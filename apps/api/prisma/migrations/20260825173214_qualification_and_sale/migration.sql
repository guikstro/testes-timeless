-- CreateEnum
CREATE TYPE "ClassificationTarget" AS ENUM ('QUALIFIED', 'WON');

-- CreateEnum
CREATE TYPE "ClassifierType" AS ENUM ('RULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('SALE_CREATED', 'SALE_UPDATED', 'SALE_DELETED', 'ATTRIBUTION_CHANGED', 'LEAD_STATUS_CHANGED', 'CONNECTION_CHANGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadEventType" ADD VALUE 'QUALIFIED';
ALTER TYPE "LeadEventType" ADD VALUE 'SALE_DETECTED';
ALTER TYPE "LeadEventType" ADD VALUE 'REVENUE_DETECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'QUALIFIED';
ALTER TYPE "LeadStatus" ADD VALUE 'WON';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "qualified_at" TIMESTAMP(3),
ADD COLUMN     "won_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "classification_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "target_status" "ClassificationTarget" NOT NULL,
    "phrase" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "classifier_type" "ClassifierType" NOT NULL,
    "evidence_message_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classification_rules_organization_id_idx" ON "classification_rules"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_lead_id_key" ON "sales"("lead_id");

-- CreateIndex
CREATE INDEX "sales_organization_id_idx" ON "sales"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_evidence_message_id_fkey" FOREIGN KEY ("evidence_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

