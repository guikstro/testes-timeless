-- Em atendimento: entre Novo e Qualificado. Só acrescenta: nenhum lead muda
-- de estágio por causa desta migration.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS' BEFORE 'QUALIFIED';

-- Eventos da linha do tempo do lead.
ALTER TYPE "LeadEventType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_STARTED';
ALTER TYPE "LeadEventType" ADD VALUE IF NOT EXISTS 'OWNER_ASSIGNED';

-- Acompanhamento: responsável, valor potencial e próxima ação.
ALTER TABLE "leads" ADD COLUMN "responsavel_id" TEXT;
ALTER TABLE "leads" ADD COLUMN "em_atendimento_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "valor_potencial_centavos" INTEGER;
ALTER TABLE "leads" ADD COLUMN "proxima_acao" TEXT;
ALTER TABLE "leads" ADD COLUMN "proxima_acao_em" TIMESTAMP(3);

ALTER TABLE "leads" ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "leads_organization_id_responsavel_id_idx" ON "leads"("organization_id", "responsavel_id");
