-- GestRest seed multi-tenant (SQL puro). Idempotente.
BEGIN;

-- Superadmin (sem restaurante)
INSERT INTO "users" ("id","name","email","passwordHash","role","updatedAt") VALUES (gen_random_uuid()::text,'Super Admin','super@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','SUPERADMIN',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;

-- Restaurante demo
INSERT INTO "restaurants" ("id","name","slug","updatedAt") VALUES ('b86636c3-c6db-4195-867d-7e79a14a6827','Restaurante Demo','demo',CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;

-- Equipe do restaurante
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Administrador','admin@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','ADMIN','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Gerente','gerente@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','MANAGER','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Garçom João','garcom@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','WAITER','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Suqueiro Ana','suqueiro@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','JUICER','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Cozinheiro Pedro','cozinha@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','COOK','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;
INSERT INTO "users" ("id","name","email","passwordHash","role","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,'Caixa Maria','caixa@gestrest.com','$2a$10$D7Q7dvxPtCglkxxi9xVq1.gLH/u2owT1WyOFnFC0mqyhNrBMhNJ9C','CASHIER','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("email") DO NOTHING;

-- Categorias
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('c03cf1a1-69bb-4914-ac55-293f049c7d57','Sucos','JUICE_BAR',1,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('9e0b2692-d8ce-4c7a-8dfc-e395a5bf93af','Refrigerantes','JUICE_BAR',2,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('a35ec426-8553-4de9-9c6a-f71b0541b093','Água','JUICE_BAR',3,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('5350b691-328a-4ce7-a444-2031315cdf10','Pastéis','KITCHEN',4,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('865a67f7-6c10-43b8-bb91-90cf5b6921cf','Mini Pizzas','KITCHEN',5,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('6352713c-b4db-468c-bf52-e1bfc63f0640','Sobremesas','KITCHEN',6,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;
INSERT INTO "categories" ("id","name","station","sortOrder","restaurantId") VALUES ('6951a236-ee53-4f65-9db4-1d0cc6256a94','Outros','NONE',7,'b86636c3-c6db-4195-867d-7e79a14a6827') ON CONFLICT ("restaurantId","name") DO NOTHING;

-- Produtos (só se o restaurante ainda não tem)
INSERT INTO "products" ("id","name","price","avgPrepMin","categoryId","restaurantId","updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid()::text,'Suco de Laranja',9.9::decimal,5,'c03cf1a1-69bb-4914-ac55-293f049c7d57','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Suco de Morango',11.9::decimal,5,'c03cf1a1-69bb-4914-ac55-293f049c7d57','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Suco de Maracujá',10.9::decimal,5,'c03cf1a1-69bb-4914-ac55-293f049c7d57','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Coca-Cola Lata',6::decimal,1,'9e0b2692-d8ce-4c7a-8dfc-e395a5bf93af','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Água Mineral 500ml',4::decimal,1,'a35ec426-8553-4de9-9c6a-f71b0541b093','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Pastel de Carne',8.5::decimal,12,'5350b691-328a-4ce7-a444-2031315cdf10','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Pastel de Queijo',8.5::decimal,12,'5350b691-328a-4ce7-a444-2031315cdf10','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Mini Pizza Calabresa',15.9::decimal,15,'865a67f7-6c10-43b8-bb91-90cf5b6921cf','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Mini Pizza Mussarela',14.9::decimal,15,'865a67f7-6c10-43b8-bb91-90cf5b6921cf','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Petit Gateau',13.9::decimal,10,'6352713c-b4db-468c-bf52-e1bfc63f0640','b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP)
) AS v WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "restaurantId"='b86636c3-c6db-4195-867d-7e79a14a6827');

-- Adicionais
INSERT INTO "additionals" ("id","name","price","categoryId","restaurantId")
SELECT * FROM (VALUES
  (gen_random_uuid()::text,'Leite condensado',2.5::decimal,'c03cf1a1-69bb-4914-ac55-293f049c7d57','b86636c3-c6db-4195-867d-7e79a14a6827'),
  (gen_random_uuid()::text,'Whey / Proteína',6::decimal,'c03cf1a1-69bb-4914-ac55-293f049c7d57','b86636c3-c6db-4195-867d-7e79a14a6827'),
  (gen_random_uuid()::text,'Queijo extra',3::decimal,'5350b691-328a-4ce7-a444-2031315cdf10','b86636c3-c6db-4195-867d-7e79a14a6827'),
  (gen_random_uuid()::text,'Bacon',4::decimal,'5350b691-328a-4ce7-a444-2031315cdf10','b86636c3-c6db-4195-867d-7e79a14a6827'),
  (gen_random_uuid()::text,'Borda recheada',5::decimal,'865a67f7-6c10-43b8-bb91-90cf5b6921cf','b86636c3-c6db-4195-867d-7e79a14a6827')
) AS v WHERE NOT EXISTS (SELECT 1 FROM "additionals" WHERE "restaurantId"='b86636c3-c6db-4195-867d-7e79a14a6827');

-- Mesas 1..20
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,1,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,2,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,3,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,4,6,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,5,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,6,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,7,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,8,6,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,9,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,10,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,11,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,12,6,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,13,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,14,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,15,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,16,6,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,17,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,18,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,19,4,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;
INSERT INTO "tables" ("id","number","seats","restaurantId","updatedAt") VALUES (gen_random_uuid()::text,20,6,'b86636c3-c6db-4195-867d-7e79a14a6827',CURRENT_TIMESTAMP) ON CONFLICT ("restaurantId","number") DO NOTHING;

COMMIT;
