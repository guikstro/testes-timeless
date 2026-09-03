#!/bin/sh
# Restaura uma cópia de segurança.
#
# Separado do backup de propósito: restaurar apaga o que está lá, e um script
# que faz as duas coisas acaba sendo chamado com o argumento errado no pior
# momento possível.
#
# Uso:
#   restaurar.sh /backups/tintim-20260903-020000.sql.gz            no banco atual
#   restaurar.sh /backups/tintim-...sql.gz nome_do_banco_de_teste  num banco novo
set -eu

ARQUIVO="${1:?informe o arquivo .sql.gz}"
DESTINO="${2:-}"

if [ ! -f "$ARQUIVO" ]; then
  echo "arquivo não encontrado: $ARQUIVO" >&2
  exit 1
fi

# A verificação vem antes de qualquer escrita: um arquivo corrompido descoberto
# no meio da restauração deixaria o banco pela metade.
if ! gzip -t "$ARQUIVO"; then
  echo "arquivo corrompido: $ARQUIVO" >&2
  exit 1
fi

if [ -n "$DESTINO" ]; then
  echo "criando $DESTINO e restaurando nele"
  psql --dbname="$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DESTINO\";"
  psql --dbname="$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DESTINO\";"
  destino_url="$(echo "$DATABASE_URL" | sed "s|/[^/?]*\(?.*\)\{0,1\}$|/$DESTINO|")"
  gzip -dc "$ARQUIVO" | psql --dbname="$destino_url" -v ON_ERROR_STOP=1 --quiet
  echo "restaurado em $DESTINO"
else
  echo "restaurando no banco atual; o conteúdo existente será substituído"
  gzip -dc "$ARQUIVO" | psql --dbname="$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet
  echo "restaurado"
fi
