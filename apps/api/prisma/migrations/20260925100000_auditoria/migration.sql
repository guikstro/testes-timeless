-- Auditoria utilizável. Nada é apagado: só colunas e valores novos, e uma
-- troca de regra na chave estrangeira.

-- Os tipos de ação novos.
ALTER TYPE "AuditAction" ADD VALUE 'IMPERSONATION_ENDED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'EMAIL_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'MFA_CODES_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'SESSIONS_ENDED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_CONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_DISCONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'AD_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'AD_BUDGET_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'BUDGET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BUDGET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BUDGET_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPAIGN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPAIGN_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SPEND_IMPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'TRACKING_LINK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRACKING_LINK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRACKING_LINK_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CLASSIFICATION_RULE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CLASSIFICATION_RULE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DATA_EXPORTED';

-- Quem fez passa a ser opcional, e apagar a pessoa não apaga mais o que ela
-- fez: o registro fica, com o nome copiado abaixo.
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD COLUMN "autor_nome" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "autor_email" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "via_suporte" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "audit_logs" ADD COLUMN "ip" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "aparelho" TEXT;

-- Os registros antigos ganham o nome de quem fez, enquanto a pessoa existe.
UPDATE "audit_logs" a SET "autor_nome" = u."name", "autor_email" = u."email"
FROM "users" u WHERE u."id" = a."user_id" AND a."autor_nome" IS NULL;

CREATE INDEX "audit_logs_organization_id_action_created_at_idx" ON "audit_logs"("organization_id", "action", "created_at");
