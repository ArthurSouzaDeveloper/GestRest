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

echo "==> 5/5  Criando o seu super admin (apenas na primeira vez)..."
# Não usamos mais "prisma db seed" aqui de propósito: ele criava um restaurante de
# demonstração inteiro com senha fixa "123456" documentada no código-fonte, e este
# script anunciava essa senha no terminal — em produção real isso é uma conta
# SUPERADMIN (o papel mais privilegiado da plataforma) com senha pública. Em vez
# disso, você escolhe seu próprio e-mail e senha agora.
if [ ! -f .seeded ]; then
  echo ""
  echo "    Escolha o e-mail e a senha do SEU super admin (não são os do banco, são só seus):"
  read -rp "    E-mail: " SUPER_EMAIL
  read -rsp "    Senha (mínimo 8 caracteres): " SUPER_PASSWORD
  echo ""
  read -rp "    Nome: " SUPER_NAME

  if $COMPOSE exec -T backend node dist/scripts/create-superadmin.js \
      --email="$SUPER_EMAIL" --senha="$SUPER_PASSWORD" --nome="$SUPER_NAME"; then
    touch .seeded
    echo "    Super admin criado. Acesse /super com o e-mail e senha que você digitou."
  else
    echo "    !! Falhou ao criar o super admin. Veja o erro acima e rode de novo manualmente:"
    echo "       $COMPOSE exec backend node dist/scripts/create-superadmin.js --email=... --senha=... --nome=..."
  fi
else
  echo "    Já foi configurado antes (arquivo .seeded existe). Pulando."
  echo "    Para trocar a senha do super admin: $COMPOSE exec backend node dist/scripts/create-superadmin.js --email=... --senha=... --nome=..."
fi

IP=$(grep '^PUBLIC_URL=' .env | cut -d= -f2-)
echo ""
echo "======================================================================"
echo "  ✅ GestRest no ar!  Acesse:  ${IP:-http://SEU_IP}"
echo "  Painel da plataforma (crie restaurantes aqui): ${IP:-http://SEU_IP}/super"
echo "  Comandos úteis:"
echo "    Ver logs:      $COMPOSE logs -f"
echo "    Reiniciar:     $COMPOSE restart"
echo "    Atualizar:     git pull && $COMPOSE up -d --build"
echo "======================================================================"
