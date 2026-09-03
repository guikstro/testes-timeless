-- `external_id` deixa de ser único no sistema inteiro e passa a ser único
-- dentro do dono.
--
-- Sendo global, o id da campanha era um espaço compartilhado entre clientes
-- que não têm relação nenhuma, com duas consequências:
--
-- 1. Registrar uma campanha manual com um id já usado devolvia conflito, o que
--    revelava que outra organização usava aquele id e bloqueava quem tentasse
--    registrar o id verdadeiro da própria campanha.
-- 2. A sincronização casa a linha por este campo e o ramo de atualização não
--    mexe em `organization_id`. Um id ocupado por outro cliente faria o nome e
--    o estado da campanha de um serem escritos na linha do outro.
--
-- Nenhuma linha existente é afetada: sair de uma restrição global para uma
-- restrição por dono só afrouxa, e o que já passava continua passando.
DROP INDEX "campaigns_external_id_key";
DROP INDEX "ad_sets_external_id_key";
DROP INDEX "ads_external_id_key";

CREATE UNIQUE INDEX "campaigns_organization_id_external_id_key"
  ON "campaigns" ("organization_id", "external_id");
CREATE UNIQUE INDEX "ad_sets_campaign_id_external_id_key"
  ON "ad_sets" ("campaign_id", "external_id");
CREATE UNIQUE INDEX "ads_ad_set_id_external_id_key"
  ON "ads" ("ad_set_id", "external_id");
