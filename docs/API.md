# API — GestRest

Base URL: `/api` · Autenticação: `Authorization: Bearer <accessToken>` · Documentação interativa: `GET /api/docs` (Swagger UI).

Todos os erros seguem o formato:

```json
{ "error": { "code": "NOT_FOUND", "message": "Pedido não encontrado" } }
```

## Autenticação

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| POST | `/auth/login` | Login; retorna `accessToken` + define cookie de refresh | público |
| POST | `/auth/refresh` | Renova o access token (usa cookie httpOnly) | público (cookie) |
| POST | `/auth/logout` | Revoga o refresh token | público |
| GET | `/auth/me` | Usuário autenticado | autenticado |

```bash
curl -X POST /api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"caixa@gestrest.com","password":"123456"}'
```

## Mesas

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/tables` | Lista mesas com pedidos ativos | autenticado |
| POST | `/tables` | Cria mesa | ADMIN, MANAGER |
| DELETE | `/tables/:id` | Remove mesa | ADMIN, MANAGER |

## Catálogo

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/catalog/categories` | Categorias | autenticado |
| GET | `/catalog/products?search=&categoryId=&available=true` | Produtos | autenticado |
| GET | `/catalog/additionals?categoryId=&active=true` | Adicionais | autenticado |
| POST/PATCH/DELETE | `/catalog/{products,categories,additionals}` | CRUD | ADMIN, MANAGER |

## Pedidos (comandas)

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/orders?status=&tableId=` | Lista pedidos (serializados com totais) | autenticado |
| GET | `/orders/:id` | Detalhe do pedido | autenticado |
| POST | `/orders` | Abre mesa / cria comanda | WAITER, MANAGER, ADMIN |
| POST | `/orders/:id/items` | Adiciona itens (roteamento automático por estação) | WAITER, MANAGER, ADMIN |
| PATCH | `/orders/:id` | Atualiza desconto/taxa/observação (concorrência: envie `version`) | CASHIER, MANAGER, ADMIN |
| PATCH | `/orders/items/:itemId` | Altera quantidade/observação do item | CASHIER, MANAGER, ADMIN |
| POST | `/orders/items/:itemId/status` | Muda status de produção (`WAITING`→`PREPARING`→`DONE`) | JUICER, COOK, MANAGER, ADMIN |
| DELETE | `/orders/items/:itemId` | Cancela item | CASHIER, MANAGER, ADMIN |
| POST | `/orders/:id/cancel` | Cancela o pedido inteiro | CASHIER, MANAGER, ADMIN |
| POST | `/orders/:id/pay` | Recebe pagamento (suporta misto) | CASHIER, MANAGER, ADMIN |

### Exemplo — adicionar itens

```json
POST /api/orders/:id/items
{
  "items": [
    { "productId": "uuid-suco", "quantity": 2, "notes": "sem açúcar" },
    { "productId": "uuid-pastel", "quantity": 1, "additionalIds": ["uuid-bacon"] }
  ]
}
```

### Exemplo — pagamento misto com troco

```json
POST /api/orders/:id/pay
{
  "payments": [
    { "method": "PIX", "amount": 30 },
    { "method": "CASH", "amount": 45, "cashReceived": 50 }
  ]
}
```

O objeto de pedido inclui `totals`: `{ subtotal, serviceFee, discount, total, paid, remaining }`.

## Produção

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/production/kitchen` | Fila da cozinha (mais antigo → recente, com `waitingMin` e `critical`) | autenticado |
| GET | `/production/juice-bar` | Fila dos suqueiros | autenticado |

## Gestão

| Método | Rota | Descrição | Acesso |
|--------|------|-----------|--------|
| GET | `/dashboard` | Métricas em tempo real | ADMIN, MANAGER |
| GET/POST/PATCH | `/users` | Gestão de usuários | ADMIN, MANAGER |
| GET | `/audit?skip=&take=` | Logs de auditoria | ADMIN, MANAGER |
| GET | `/health` | Health check | público |

## Eventos em tempo real (Socket.IO)

Conecte em `/` com `auth: { token }`. Entre nas salas com `socket.emit('join', room)`.

| Sala | Consumidor | Eventos recebidos |
|------|-----------|-------------------|
| `kitchen` | Cozinha | `production:updated` |
| `juice_bar` | Suqueiros | `production:updated` |
| `cashier` | Caixa | `order:updated`, `order:paid` |
| `floor` | Garçons/Mesas | `order:created`, `order:updated`, `table:updated` |
| `dashboard` | Dashboard | todos |
