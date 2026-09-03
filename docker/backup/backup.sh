#!/bin/sh
# Cópia de segurança do banco.
#
# Roda num contêiner próprio com a imagem do Postgres, e não dentro da API:
# assim o pg_dump é exatamente da mesma versão do servidor, e nenhuma imagem
# da aplicação precisa carregar o cliente de banco só por causa disto.
#
# Uso:
#   backup.sh          laço contínuo, uma cópia por intervalo
#   backup.sh uma-vez  uma cópia agora e sai
set -eu

PASTA="${BACKUP_DIR:-/backups}"
# Quantas cópias guardar. Com uma por dia, trinta dias de histórico: espaço é
# barato perto de descobrir tarde que o dado de três semanas atrás sumiu.
MANTER="${BACKUP_KEEP:-30}"
INTERVALO="${BACKUP_INTERVAL_SECONDS:-86400}"

registrar() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"
}

copiar() {
  mkdir -p "$PASTA"
  carimbo="$(date -u +%Y%m%d-%H%M%S)"
  parcial="$PASTA/.parcial-$carimbo.sql.gz"
  final="$PASTA/tintim-$carimbo.sql.gz"

  registrar "iniciando"

  # Escreve num nome temporário e só renomeia no fim. Sem isto, uma queda no
  # meio deixaria um arquivo truncado com cara de cópia boa, e a descoberta
  # aconteceria justamente na hora de restaurar.
  if pg_dump --format=plain --no-owner --no-privileges \
      --dbname="$DATABASE_URL" | gzip -9 > "$parcial"; then
    mv "$parcial" "$final"
    registrar "gravado $(basename "$final") ($(du -h "$final" | cut -f1))"
  else
    rm -f "$parcial"
    registrar "FALHOU"
    return 1
  fi

  # Descarta as mais antigas, mantendo as últimas.
  total="$(ls -1 "$PASTA"/tintim-*.sql.gz 2>/dev/null | wc -l)"
  if [ "$total" -gt "$MANTER" ]; then
    ls -1 "$PASTA"/tintim-*.sql.gz | sort | head -n "$((total - MANTER))" | while read -r velho; do
      rm -f "$velho"
      registrar "descartado $(basename "$velho")"
    done
  fi
}

if [ "${1:-}" = "uma-vez" ]; then
  copiar
  exit $?
fi

registrar "em pé, uma cópia a cada ${INTERVALO}s, guardando as últimas $MANTER"
while true; do
  # Falhar não derruba o laço: um banco momentaneamente fora do ar não pode
  # cancelar todas as cópias futuras.
  copiar || registrar "seguindo apesar da falha"
  sleep "$INTERVALO"
done
