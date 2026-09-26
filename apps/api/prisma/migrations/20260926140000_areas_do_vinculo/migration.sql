-- Áreas que um MEMBER pode usar no cliente. OWNER/ADMIN ignoram a coluna.
ALTER TABLE "memberships" ADD COLUMN "areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Quem já era MEMBER continua vendo tudo, como antes.
UPDATE "memberships"
SET "areas" = ARRAY['dashboard','conversas','leads','campanhas','verba','links','integracoes','relatorio','configuracoes']
WHERE "role" = 'MEMBER';
