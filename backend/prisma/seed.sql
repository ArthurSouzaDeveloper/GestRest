-- GestRest seed (SQL puro). Idempotente para usuários/categorias/mesas.
BEGIN;

-- Usuários
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Administrador', 'admin@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'ADMIN', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Gerente', 'gerente@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'MANAGER', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Garçom João', 'garcom@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'WAITER', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Suqueiro Ana', 'suqueiro@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'JUICER', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Cozinheiro Pedro', 'cozinha@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'COOK', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text, 'Caixa Maria', 'caixa@gestrest.com', '$2a$10$le2d4JersGT0coPCbJfY5uPKIHjvPI5.n1vIWnQyojDZxfUMtlIQ.', 'CASHIER', CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;

-- Categorias
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('d0606c40-979c-490c-b67c-a71b6942b026', 'Sucos', 'JUICE_BAR', 1) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('2513cd03-56c1-475e-946d-9a703865c29e', 'Refrigerantes', 'JUICE_BAR', 2) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('27172590-ed85-43c2-940f-96c8ba9246c2', 'Água', 'JUICE_BAR', 3) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('649d4a92-c552-4e80-a8e7-af7717af0650', 'Pastéis', 'KITCHEN', 4) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('157be32d-775d-4d6b-8809-86a1a288d772', 'Mini Pizzas', 'KITCHEN', 5) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('5ce58784-83eb-4655-b8a5-f73e7ceaea6c', 'Sobremesas', 'KITCHEN', 6) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder") VALUES ('e7b5d4b4-71df-45f4-9f51-10de3993ea87', 'Outros', 'NONE', 7) ON CONFLICT ("name") DO NOTHING;

-- Produtos (só se ainda não houver produtos)
INSERT INTO "products" ("id","name","price","avgPrepMin","categoryId","updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'Suco de Laranja', 9.9::decimal, 5, 'd0606c40-979c-490c-b67c-a71b6942b026', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Suco de Morango', 11.9::decimal, 5, 'd0606c40-979c-490c-b67c-a71b6942b026', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Suco de Maracujá', 10.9::decimal, 5, 'd0606c40-979c-490c-b67c-a71b6942b026', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Vitamina de Banana', 12.9::decimal, 7, 'd0606c40-979c-490c-b67c-a71b6942b026', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Coca-Cola Lata', 6::decimal, 1, '2513cd03-56c1-475e-946d-9a703865c29e', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Guaraná Lata', 6::decimal, 1, '2513cd03-56c1-475e-946d-9a703865c29e', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Água Mineral 500ml', 4::decimal, 1, '27172590-ed85-43c2-940f-96c8ba9246c2', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Pastel de Carne', 8.5::decimal, 12, '649d4a92-c552-4e80-a8e7-af7717af0650', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Pastel de Queijo', 8.5::decimal, 12, '649d4a92-c552-4e80-a8e7-af7717af0650', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Pastel de Frango c/ Catupiry', 9.5::decimal, 14, '649d4a92-c552-4e80-a8e7-af7717af0650', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mini Pizza Calabresa', 15.9::decimal, 15, '157be32d-775d-4d6b-8809-86a1a288d772', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mini Pizza Mussarela', 14.9::decimal, 15, '157be32d-775d-4d6b-8809-86a1a288d772', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mini Pizza Portuguesa', 16.9::decimal, 16, '157be32d-775d-4d6b-8809-86a1a288d772', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Petit Gateau', 13.9::decimal, 10, '5ce58784-83eb-4655-b8a5-f73e7ceaea6c', CURRENT_TIMESTAMP)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM "products");

-- Adicionais (só se ainda não houver adicionais)
INSERT INTO "additionals" ("id","name","price","categoryId")
SELECT * FROM (VALUES
  (gen_random_uuid()::text, 'Leite condensado', 2.5::decimal, 'd0606c40-979c-490c-b67c-a71b6942b026'),
  (gen_random_uuid()::text, 'Whey / Proteína', 6::decimal, 'd0606c40-979c-490c-b67c-a71b6942b026'),
  (gen_random_uuid()::text, 'Mel', 2::decimal, 'd0606c40-979c-490c-b67c-a71b6942b026'),
  (gen_random_uuid()::text, 'Polpa extra', 3::decimal, 'd0606c40-979c-490c-b67c-a71b6942b026'),
  (gen_random_uuid()::text, 'Queijo extra', 3::decimal, '649d4a92-c552-4e80-a8e7-af7717af0650'),
  (gen_random_uuid()::text, 'Cheddar', 3.5::decimal, '649d4a92-c552-4e80-a8e7-af7717af0650'),
  (gen_random_uuid()::text, 'Catupiry', 3.5::decimal, '649d4a92-c552-4e80-a8e7-af7717af0650'),
  (gen_random_uuid()::text, 'Bacon', 4::decimal, '649d4a92-c552-4e80-a8e7-af7717af0650'),
  (gen_random_uuid()::text, 'Ovo', 2::decimal, '649d4a92-c552-4e80-a8e7-af7717af0650'),
  (gen_random_uuid()::text, 'Borda recheada', 5::decimal, '157be32d-775d-4d6b-8809-86a1a288d772'),
  (gen_random_uuid()::text, 'Queijo extra', 4::decimal, '157be32d-775d-4d6b-8809-86a1a288d772'),
  (gen_random_uuid()::text, 'Calabresa extra', 4.5::decimal, '157be32d-775d-4d6b-8809-86a1a288d772')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM "additionals");

-- Mesas 1..20
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 1, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 2, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 3, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 4, 6, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 5, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 6, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 7, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 8, 6, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 9, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 10, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 11, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 12, 6, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 13, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 14, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 15, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 16, 6, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 17, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 18, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 19, 4, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","updatedAt") VALUES (gen_random_uuid()::text, 20, 6, CURRENT_TIMESTAMP) ON CONFLICT ("number") DO NOTHING;

COMMIT;
