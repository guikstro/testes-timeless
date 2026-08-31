-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LEAD_DISQUALIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAD_REACTIVATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadEventType" ADD VALUE 'MEETING_SCHEDULED';
ALTER TYPE "LeadEventType" ADD VALUE 'DISQUALIFIED';
ALTER TYPE "LeadEventType" ADD VALUE 'REACTIVATED';

-- AlterEnum
ALTER TYPE "LeadStatus" ADD VALUE 'MEETING_SCHEDULED';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "disqualified_at" TIMESTAMP(3),
ADD COLUMN     "disqualified_reason" TEXT,
ADD COLUMN     "meeting_scheduled_at" TIMESTAMP(3);

