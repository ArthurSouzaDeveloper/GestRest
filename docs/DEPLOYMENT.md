# Manual de Implantação — GestRest

## 1. Pré-requisitos

- Docker + Docker Compose **ou** Node 22+ e PostgreSQL 16+.
- Domínio/servidor com portas liberadas (80/443 para o frontend, 4000 para a API se exposta).

## 2. Variáveis de ambiente (backend)

Copie `backend/.env.example` para `backend/.env` e ajuste:

| Variável | Descrição |
|----------|-----------|
| `NODE_ENV` | `production` em produção |
| `PORT` | Porta da API (padrão 4000) |
| `CORS_ORIGIN` | Origem do frontend (ex.: `https://app.seurestaurante.com`) |
| `DATABASE_URL` | String de conexão PostgreSQL |
| `JWT_ACCESS_SECRET` | **Troque** por um segredo forte e único |
| `JWT_REFRESH_SECRET` | **Troque** por um segredo forte e único |
| `JWT_ACCESS_EXPIRES` | Ex.: `15m` |
| `JWT_REFRESH_EXPIRES` | Ex.: `7d` |

> ⚠️ Em produção, gere segredos aleatórios (ex.: `openssl rand -hex 32`) e nunca os versione.

## 3. Deploy com Docker Compose

**Produção com domínio e HTTPS (recomendado)**: use `docker-compose.prod.yml`, que já
inclui um Caddy na frente cuidando do certificado TLS automaticamente (Let's Encrypt) —
guia completo passo a passo em [`docs/DEPLOY_HETZNER.md`](./DEPLOY_HETZNER.md). Resumo:

```bash
cp .env.production.example .env
nano .env   # POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (openssl rand -hex 32) e DOMAIN
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

**`docker-compose.yml` (sem `-f`)** é uma versão mais simples, **sem HTTPS**, pensada só
para desenvolvimento local ou uma rede interna já protegida por outra camada (ex.: atrás
de uma VPN) — nunca para expor direto na internet com dados de clientes reais. Também
exige `.env` com os mesmos três segredos (sem `DOMAIN`, já que não tem Caddy):

```bash
cp .env.production.example .env
nano .env   # troque POSTGRES_PASSWORD, JWT_ACCESS_SECRET e JWT_REFRESH_SECRET (gere com: openssl rand -hex 32)
docker compose up --build -d
```

Qualquer um dos dois sobe os mesmos serviços de base: `db` (PostgreSQL), `backend` (API — aplica migrações no boot) e `frontend` (nginx servindo a SPA + proxy para a API); o `-prod` acrescenta o `caddy`.

Criar o super admin (necessário para acessar `/super` e cadastrar restaurantes) — acrescente `-f docker-compose.prod.yml` se for esse o caminho usado:

```bash
docker compose exec backend node dist/scripts/create-superadmin.js \
  --email=seu@email.com --senha=SuaSenhaForte123 --nome="Seu Nome"
```

Populares dados de demonstração (opcional, só para ambiente de teste — **nunca em produção com clientes reais**, exige `SEED_PASSWORD` para não usar a senha padrão de desenvolvimento):

```bash
docker compose exec -e SEED_PASSWORD=SuaSenhaForte123 backend npx prisma db seed
```

## 4. Deploy manual (sem Docker)

```bash
# Backend
cd backend
npm ci
npx prisma migrate deploy        # aplica migrações
npm run build
node dist/server.js              # ou via PM2 / systemd

# Frontend
cd frontend
npm ci
npm run build                    # gera dist/ — sirva com nginx/Caddy/S3
```

Configure o nginx do frontend para servir `dist/` com fallback SPA e fazer proxy de `/api` e `/socket.io` para a API (veja `frontend/nginx.conf`).

## 5. Banco de dados — migrações

```bash
npx prisma migrate deploy    # produção (aplica migrações existentes)
npx prisma migrate dev       # desenvolvimento (cria novas migrações)
npx prisma studio            # inspeção visual do banco
```

## 6. Primeiro acesso

Acesse `/super` com o e-mail e senha que você definiu no `create-superadmin.js`, cadastre cada restaurante (com o e-mail/senha próprios do admin dele) e crie a equipe real em **Usuários** dentro de cada restaurante.

## 7. Checklist de produção

- [ ] Segredos JWT trocados e fora do versionamento (arquivo `.env`, nunca no `docker-compose.yml`).
- [ ] `POSTGRES_PASSWORD` trocado por um valor forte (nunca o padrão `gestrest`).
- [ ] Porta do PostgreSQL (5432) **não** publicada para a internet — só acessível pelos outros containers da mesma rede docker compose.
- [ ] `CORS_ORIGIN` restrito ao domínio real.
- [ ] HTTPS habilitado — use `docker-compose.prod.yml` (Caddy + Let's Encrypt automático, ver `docs/DEPLOY_HETZNER.md`); `COOKIE_SECURE=true` só funciona de verdade com HTTPS real na frente.
- [ ] Backup automático do PostgreSQL agendado via cron (`bash deploy/backup-db.sh` — ver comentário no topo do script).
- [ ] Limpeza periódica de refresh tokens expirados/revogados agendada via cron (`docker exec gestrest-backend node dist/scripts/cleanup-refresh-tokens.js` — ver comentário no topo do script).
- [ ] Usuários de demonstração removidos/senha alterada.
- [ ] (Alta disponibilidade) Socket.IO com adapter Redis ao rodar múltiplas instâncias.

## 8. CI/CD

O workflow em `.github/workflows/ci.yml` roda a cada push/PR: instala dependências, gera o Prisma Client, aplica migrações em um Postgres de serviço, compila e executa os testes do backend, e compila o frontend.
