#!/usr/bin/env bash
# GestRest — backup diário do PostgreSQL.
# Uso (como root, dentro da pasta do projeto já clonada):
#   bash deploy/backup-db.sh
#
# Agendar via cron (diariamente às 3h da manhã):
#   crontab -e
#   0 3 * * * cd /root/GestRest && bash deploy/backup-db.sh >> /var/log/gestrest-backup.log 2>&1
#
# Sem isso, perder o volume do Postgres (disco corrompido, `docker compose down -v`
# acidental) apaga permanentemente todo o histórico de pedidos e clientes — sem
# nenhuma via de recuperação (achado de auditoria de segurança/continuidade).
set -euo pipefail

cd "$(dirname "$0")/.."

# Lê POSTGRES_USER/POSTGRES_DB do .env se existir (mesmo arquivo que o docker-compose já
# usa); assume os padrões do projeto se não houver .env.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
DB_USER="${POSTGRES_USER:-gestrest}"
DB_NAME="${POSTGRES_DB:-gestrest}"

BACKUP_DIR="./backups"
RETENTION_DAYS=14
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/gestrest-$TIMESTAMP.sql.gz"

echo "==> Gerando dump de '$DB_NAME' (usuário '$DB_USER')..."
# "docker exec" no nome fixo do container (gestrest-db) em vez de "docker compose exec":
# funciona igual independente de qual arquivo compose está rodando (docker-compose.yml
# ou docker-compose.prod.yml) — não precisa saber/adivinhar qual "-f" usar aqui.
docker exec gestrest-db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"
echo "    OK: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

echo "==> Removendo backups com mais de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name 'gestrest-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete

echo "==> Concluído. Lembrete: isso protege contra perda do disco LOCAL, não contra o"
echo "    servidor inteiro sumir — copie periodicamente $BACKUP_DIR para outro lugar"
echo "    (ex.: rsync para outro servidor, ou upload pra um bucket S3-compatível)."
