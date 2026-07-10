# Arquitetura — GestRest

## Visão geral

Sistema desacoplado em **frontend** (SPA React) e **backend** (API REST + WebSocket), com PostgreSQL como fonte de verdade.

```
┌─────────────┐    HTTPS/REST     ┌──────────────────────────┐     ┌────────────┐
│  Frontend   │ ────────────────▶ │        Backend           │────▶│ PostgreSQL │
│ React + Vite│ ◀──── Socket.IO ──│ Express + Prisma + Socket │     │            │
└─────────────┘   (tempo real)    └──────────────────────────┘     └────────────┘
```

## Camadas do backend (Clean Architecture / SOLID)

```
src/
├── config/          # env, prisma client, logger, swagger  (infra transversal)
├── domain/          # (modelo de domínio expresso via prisma/schema.prisma)
├── application/
│   └── services/    # regras de negócio (Service Layer): order, payment, production...
├── infrastructure/  # (repositórios — acesso via Prisma client dentro dos services)
├── presentation/
│   ├── routes/      # roteamento HTTP
│   ├── middlewares/ # auth, rbac, validação, erros, rate-limit
│   └── validators/  # schemas Zod (sanitização/validação de entrada)
├── socket/          # canal de eventos em tempo real (rooms por setor)
└── utils/           # auth (jwt/bcrypt), erros, helpers http
```

**Princípios aplicados:**
- **Single Responsibility**: cada service cuida de um agregado (Order, Payment, Catalog...).
- **Dependency Inversion**: controllers dependem de services, não de detalhes do Prisma.
- **Separation of Concerns**: validação (Zod), autorização (RBAC middleware), regra de negócio (service) e transporte (route) separados.
- **DDD**: linguagem ubíqua no schema (Mesa, Comanda, Estação, Produção) e invariantes protegidas em transações.

## Modelo de dados (normalizado)

Entidades principais (`prisma/schema.prisma`):

- **User** / **RefreshToken** — usuários, perfis (enum `Role`) e sessões.
- **Customer**, **RestaurantTable** — clientes e mesas (enum `TableStatus`).
- **Category** (com `station`), **Product**, **Additional** — catálogo. A **estação** (`KITCHEN` / `JUICE_BAR` / `NONE`) mora na categoria e define o roteamento automático.
- **Order** → **OrderItem** → **OrderItemAdditional** — comandas e itens. O item guarda *snapshots* de preço/estação e um `ProductionStatus` próprio.
- **Payment** — pagamentos (suporta múltiplas linhas por pedido = pagamento misto).
- **AuditLog** — trilha de auditoria.
- **Setting** — configurações chave-valor.

### Invariantes garantidas
- **Roteamento automático**: ao adicionar um item, a estação é derivada da categoria do produto e o item entra na fila do setor correto.
- **Pronto para pagamento**: `syncOrderStatus` recalcula o status do pedido a cada mudança de item; só vira `READY_FOR_PAYMENT` quando **todos** os itens ativos estão `DONE`.
- **Concorrência otimista**: `Order.version` — atualizações de caixa enviam a versão lida e recebem `409` se houver conflito.
- **Snapshots**: preço unitário e adicionais são copiados no momento do pedido, então alterações futuras no catálogo não afetam comandas abertas.

## Tempo real (Socket.IO)

Salas (rooms) por contexto de tela: `kitchen`, `juice_bar`, `cashier`, `floor`, `dashboard`.
Os services emitem eventos (`order:created`, `order:updated`, `order:paid`, `production:updated`, `table:updated`) para as salas relevantes; o frontend (`useRealtime`) invalida as queries do TanStack Query correspondentes — as telas reagem sem polling.

## Segurança

- Senhas com **bcrypt**.
- **JWT** de acesso curto (15 min) + **refresh token** rotativo em cookie `httpOnly`.
- **Helmet**, **CORS** com credenciais, **rate limiting** (global e específico de login).
- Validação e sanitização de toda entrada via **Zod**.
- **RBAC** por rota via middleware `authorize(...roles)`.
- **Auditoria** de ações sensíveis com IP e usuário.

## Escalabilidade

- API stateless (JWT) → escala horizontal atrás de um load balancer.
- Índices no schema para consultas quentes (status de mesa/pedido, fila por estação).
- Socket.IO preparado para múltiplas instâncias via adapter (Redis) em produção.
- Estrutura preparada para **multi-loja** (basta adicionar `storeId` às entidades) e integrações externas.

## Roadmap

Preparado na arquitetura, ainda não implementado nesta entrega:
- Módulo de **estoque** (tabelas e baixa automática por item).
- **Multi-loja** (tenant por unidade).
- **Exportação** PDF/Excel avançada e mais relatórios.
- **PWA**, **modos TV** (cozinha/suqueiros) e impressão automática.
- Integrações **fiscais** e **delivery**.
