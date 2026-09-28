-- Criar e excluir cliente e gerar convite deixam de aparecer como "alterou as configurações".
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'INVITE_CREATED';
