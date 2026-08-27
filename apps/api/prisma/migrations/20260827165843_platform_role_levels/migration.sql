-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" "PlatformRole";

-- Preserva quem já era operador: o booleano anterior não distinguia níveis, e
-- quem o tinha podia tudo — então o equivalente honesto é ADMIN. Rebaixar
-- alguém para SUPPORT é uma decisão humana, não algo que uma migração deva
-- adivinhar.
UPDATE "users" SET "platform_role" = 'ADMIN' WHERE "is_platform_admin" = true;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_platform_admin";
