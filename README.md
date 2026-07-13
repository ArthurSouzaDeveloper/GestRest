# 🍽️ GestRest — Sistema Profissional de Gestão de Restaurante

Sistema completo de gestão de pedidos para restaurante especializado em **Sucos, Pastéis e Mini Pizzas**, com distribuição automática de pedidos por setor, produção em tempo real e caixa integrado.

Construído para alto fluxo de atendimento: dezenas de funcionários, centenas de pedidos simultâneos, sincronização em tempo real via WebSockets.

---

## ✨ Principais recursos

- **Fluxo completo**: Abertura de mesa → lançamento de pedido → produção → pagamento → mesa livre.
- **Distribuição automática**: bebidas vão para os **Suqueiros**, comidas para a **Cozinha**, sem intervenção manual (roteamento por categoria).
- **Regra de negócio central**: o Caixa só vê o pedido como *Pronto para Pagamento* quando **todos os itens de todos os setores** estão concluídos.
- **Tempo real**: telas de cozinha, suqueiros, mesas e caixa atualizam sozinhas (Socket.IO), sem recarregar a página.
- **Controle de acesso por perfil**: Administrador, Gerente, Garçom, Suqueiro, Cozinheiro e Caixa — cada um vê apenas o que precisa.
- **Pagamentos**: PIX, Dinheiro (com troco automático), Crédito, Débito, Vale Alimentação e **pagamento misto**.
- **Caixa**: cancelar item, alterar quantidade, aplicar desconto, cancelar pedido — com recálculo automático de subtotal, taxa de serviço e valor final.
- **Dashboard e relatórios**: faturamento diário/semanal/mensal, produtos mais vendidos, garçons com mais vendas, tempo médio de produção.
- **Auditoria**: todas as ações (login, pedidos, pagamentos, mudanças de status) são registradas com usuário, IP e data/hora.
- **Concorrência**: controle otimista de versão para impedir edição simultânea do mesmo pedido.

---

## 🧱 Stack técnica

| Camada | Tecnologias |
|--------|-------------|
| Frontend | React, TypeScript, Vite, TailwindCSS, TanStack Query, React Router, Axios, Socket.IO Client, Lucide Icons |
| Backend | Node.js, Express, TypeScript |
| Banco | PostgreSQL + Prisma ORM |
| Tempo real | Socket.IO |
| Auth | JWT (access) + Refresh Token (cookie httpOnly, rotação) |
| Segurança | Bcrypt, Helmet, Rate Limiter, CORS, validação (Zod) |
| Logs | Winston |
| Docs | Swagger / OpenAPI (`/api/docs`) |
| Testes | Vitest |
| Infra | Docker, Docker Compose, GitHub Actions (CI) |

Arquitetura em camadas (Clean Architecture / SOLID): `config` → `domain (Prisma)` → `application/services` → `presentation (routes/middlewares)`, com Socket.IO como canal de eventos.

---

## 🚀 Rodando com Docker (recomendado)

```bash
docker compose up --build
```

- Frontend: <http://localhost:8080>
- API: <http://localhost:4000/api>
- Swagger: <http://localhost:4000/api/docs>

O backend aplica as migrações automaticamente na subida. Para popular dados de demonstração:

```bash
docker compose exec backend npx prisma db seed
```

## 🛠️ Rodando localmente (desenvolvimento)

Pré-requisitos: Node 22+, PostgreSQL 16+.

```bash
# 1. Banco (exemplo com Docker só para o Postgres)
docker run -d --name gestrest-db -e POSTGRES_USER=gestrest \
  -e POSTGRES_PASSWORD=gestrest -e POSTGRES_DB=gestrest -p 5432:5432 postgres:16

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev        # cria as tabelas
npm run prisma:seed           # dados de demonstração
npm run dev                   # http://localhost:4000

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

## 🏢 Multi-restaurante (multi-tenant / SaaS)

O GestRest opera como plataforma: cada restaurante é um **tenant** isolado, com seu próprio **link, equipe e cardápio**. Os dados nunca se misturam entre restaurantes (todo acesso é filtrado por `restaurantId`).

- **Super administrador** (`/super`): cria e gerencia os restaurantes e o admin inicial de cada um.
- **Link próprio por restaurante** (`/r/<slug>`): tela de login com o nome do restaurante; ex.: `/r/pizzaria-do-ze`.
- Cada restaurante monta o **próprio cardápio** (categorias, produtos, adicionais) e a **própria equipe**.

## 👥 Usuários de demonstração

Senha para todos: **`123456`**

| Acesso | E-mail | Onde entrar |
|--------|--------|-------------|
| **Super Admin** (plataforma) | super@gestrest.com | `/super` |
| Administrador (restaurante demo) | admin@gestrest.com | `/r/demo` |
| Gerente | gerente@gestrest.com | `/r/demo` |
| Garçom | garcom@gestrest.com | `/r/demo` |
| Suqueiro | suqueiro@gestrest.com | `/r/demo` |
| Cozinheiro | cozinha@gestrest.com | `/r/demo` |
| Caixa | caixa@gestrest.com | `/r/demo` |

---

## 📚 Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura, camadas e modelo de dados
- [`docs/API.md`](docs/API.md) — endpoints REST e eventos de tempo real
- [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) — manual do usuário por perfil
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — manual de implantação

## 🧪 Testes

```bash
cd backend && npm test
```

## 📈 Escopo e roadmap

Este repositório entrega o **núcleo operacional completo e funcional** (auth, mesas, catálogo, pedidos, produção, caixa, dashboard, auditoria) com fluxo ponta a ponta verificado. Itens preparados na arquitetura para evolução: multi-loja, integração fiscal/delivery, exportação PDF/Excel avançada, módulo de estoque, PWA e modos TV. Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#roadmap).
