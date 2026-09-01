-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platform" "AdPlatform" NOT NULL DEFAULT 'META';

