-- O aceite dos termos de uso e da política de privacidade no cadastro.
ALTER TABLE "users" ADD COLUMN "termos_aceitos_em" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "versao_dos_termos" TEXT;
