-- O objetivo da campanha na plataforma. Só acrescenta: nulo para as campanhas
-- que já existem, até a próxima sincronia preencher.
ALTER TABLE "campaigns" ADD COLUMN "objetivo" TEXT;
