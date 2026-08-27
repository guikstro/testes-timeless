#!/bin/bash
# A Evolution API (provider EVOLUTION do WhatsApp, Fase 8) guarda a sessão do
# número num banco próprio, na mesma instância do Postgres. Sem isso, cada
# restart do container derrubaria a conexão e exigiria ler o QR Code de novo.
#
# Só roda quando o volume do Postgres nasce vazio (docker-entrypoint-initdb.d).
# Num volume que já existe, o banco foi criado manualmente uma única vez — ver
# docs/WHATSAPP.md.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE evolution;
EOSQL
