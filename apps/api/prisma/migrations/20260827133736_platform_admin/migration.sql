-- AlterEnum
-- Safe inside a transaction on PostgreSQL 12+ because the new value is not
-- referenced in this same migration.
ALTER TYPE "AuditAction" ADD VALUE 'IMPERSONATION_STARTED';

-- AlterTable
-- Defaults to false: nobody becomes a platform operator by an existing row
-- being backfilled. The flag is granted deliberately, never by signup.
ALTER TABLE "users" ADD COLUMN     "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
