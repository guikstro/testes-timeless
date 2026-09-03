-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "expediente_ativo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expediente_dias" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "expediente_fim" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "expediente_inicio" INTEGER NOT NULL DEFAULT 540;
