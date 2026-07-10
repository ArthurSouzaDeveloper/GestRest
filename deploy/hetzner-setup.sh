#!/usr/bin/env bash
# GestRest — instalação em um servidor Hetzner (ou qualquer VPS Ubuntu).
# Uso (como root, dentro da pasta do projeto já clonada):
#   bash deploy/hetzner-setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

echo "==> 1/5  Verificando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "    Docker não encontrado. Instalando..."
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker já instalado: $(docker --version)"
fi

echo "==> 2/5  Verificando arquivo .env..."
if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "    !! Criei um .env a partir do exemplo. EDITE-O agora com seus segredos:"
  echo "       nano .env"
  echo "    Dica: gere segredos com  openssl rand -hex 32"
  exit 1
fi

# Aviso se ainda houver placeholders
if grep -q "TROQUE" .env || grep -q "SEU_IP_AQUI" .env; then
  echo "    !! O .env ainda tem valores de exemplo (TROQUE / SEU_IP_AQUI). Edite antes de continuar:"
  echo "       nano .env"
  exit 1
fi

HTTP_PORT=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2- || true)
HTTP_PORT=${HTTP_PORT:-80}
echo "==> 3/5  Abrindo a porta ${HTTP_PORT} no firewall (se o ufw estiver ativo)..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${HTTP_PORT}/tcp" || true
fi

echo "==> 4/5  Build e subida dos containers..."
$COMPOSE up -d --build

echo "    Aguardando o backend ficar saudável..."
for i in $(seq 1 40); do
  if $COMPOSE exec -T backend wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; then
    echo "    Backend OK."
    break
  fi
  sleep 3
done

echo "==> 5/5  Populando dados iniciais (apenas na primeira vez)..."
if [ ! -f .seeded ]; then
  $COMPOSE exec -T backend npx prisma db seed && touch .seeded
  echo "    Seed concluído. Usuários demo (senha 123456): admin@ / gerente@ / garcom@ / suqueiro@ / cozinha@ / caixa@ gestrest.com"
else
  echo "    Já foi populado antes (arquivo .seeded existe). Pulando."
fi

IP=$(grep '^PUBLIC_URL=' .env | cut -d= -f2-)
echo ""
echo "======================================================================"
echo "  ✅ GestRest no ar!  Acesse:  ${IP:-http://SEU_IP}"
echo "  Comandos úteis:"
echo "    Ver logs:      $COMPOSE logs -f"
echo "    Reiniciar:     $COMPOSE restart"
echo "    Atualizar:     git pull && $COMPOSE up -d --build"
echo "======================================================================"
