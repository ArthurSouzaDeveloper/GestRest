import { PrismaClient, Role, Station } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 10);

const DEFAULT_DEV_PASSWORD = '123456';
const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
const SEED_PASSWORD = process.env.SEED_PASSWORD;

// Refuses to fall back to the well-known "123456" default in production — that password is
// printed in this very source file, so anyone who has ever cloned this repo knows it. A real
// deployment must pass its own SEED_PASSWORD (or better, use the superadmin:create script and
// skip this seed's demo accounts entirely).
if (isProd && !SEED_PASSWORD) {
  console.error(
    '❌ Recusando rodar em produção sem SEED_PASSWORD definido — evita subir a senha padrão "123456" (documentada neste arquivo) para o banco real.',
  );
  console.error('   Rode com: SEED_PASSWORD="uma senha forte" npm run prisma:seed');
  console.error('   Ou, para criar só o superadmin com credenciais próprias: npm run superadmin:create -- --email=... --senha=... --nome=...');
  process.exit(1);
}
if (SEED_PASSWORD && SEED_PASSWORD.length < 8) {
  console.error('❌ SEED_PASSWORD precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}
const seedPassword = SEED_PASSWORD ?? DEFAULT_DEV_PASSWORD;

async function main() {
  console.log('🌱 Seeding GestRest (multi-tenant)...');

  // ── SUPERADMIN (dono da plataforma, sem restaurante) ──
  await prisma.user.upsert({
    where: { email: 'super@gestrest.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'super@gestrest.com',
      passwordHash: hash(seedPassword),
      role: Role.SUPERADMIN,
    },
  });

  // ── Restaurante de demonstração ──
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Restaurante Demo', slug: 'demo' },
  });
  const rid = restaurant.id;

  // Equipe do restaurante
  const staff: { name: string; email: string; role: Role }[] = [
    { name: 'Administrador', email: 'admin@gestrest.com', role: Role.ADMIN },
    { name: 'Gerente', email: 'gerente@gestrest.com', role: Role.MANAGER },
    { name: 'Garçom João', email: 'garcom@gestrest.com', role: Role.WAITER },
    { name: 'Suqueiro Ana', email: 'suqueiro@gestrest.com', role: Role.JUICER },
    { name: 'Cozinheiro Pedro', email: 'cozinha@gestrest.com', role: Role.COOK },
    { name: 'Caixa Maria', email: 'caixa@gestrest.com', role: Role.CASHIER },
  ];
  for (const u of staff) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: hash(seedPassword), restaurantId: rid },
    });
  }

  // Categorias
  const categories: { name: string; station: Station; sortOrder: number }[] = [
    { name: 'Sucos', station: Station.JUICE_BAR, sortOrder: 1 },
    { name: 'Refrigerantes', station: Station.JUICE_BAR, sortOrder: 2 },
    { name: 'Água', station: Station.JUICE_BAR, sortOrder: 3 },
    { name: 'Pastéis', station: Station.KITCHEN, sortOrder: 4 },
    { name: 'Mini Pizzas', station: Station.KITCHEN, sortOrder: 5 },
    { name: 'Sobremesas', station: Station.KITCHEN, sortOrder: 6 },
    { name: 'Outros', station: Station.NONE, sortOrder: 7 },
  ];
  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.category.upsert({
      where: { restaurantId_name: { restaurantId: rid, name: c.name } },
      update: { station: c.station, sortOrder: c.sortOrder },
      create: { ...c, restaurantId: rid },
    });
    catMap[c.name] = cat.id;
  }

  // Produtos
  const products = [
    { name: 'Suco de Laranja', category: 'Sucos', price: 9.9, avgPrepMin: 5 },
    { name: 'Suco de Morango', category: 'Sucos', price: 11.9, avgPrepMin: 5 },
    { name: 'Suco de Maracujá', category: 'Sucos', price: 10.9, avgPrepMin: 5 },
    { name: 'Coca-Cola Lata', category: 'Refrigerantes', price: 6.0, avgPrepMin: 1 },
    { name: 'Água Mineral 500ml', category: 'Água', price: 4.0, avgPrepMin: 1 },
    { name: 'Pastel de Carne', category: 'Pastéis', price: 8.5, avgPrepMin: 12 },
    { name: 'Pastel de Queijo', category: 'Pastéis', price: 8.5, avgPrepMin: 12 },
    { name: 'Mini Pizza Calabresa', category: 'Mini Pizzas', price: 15.9, avgPrepMin: 15 },
    { name: 'Mini Pizza Mussarela', category: 'Mini Pizzas', price: 14.9, avgPrepMin: 15 },
    { name: 'Petit Gateau', category: 'Sobremesas', price: 13.9, avgPrepMin: 10 },
  ];
  for (const p of products) {
    const existing = await prisma.product.findFirst({
      where: { name: p.name, restaurantId: rid },
    });
    if (!existing) {
      await prisma.product.create({
        data: {
          name: p.name,
          price: p.price,
          avgPrepMin: p.avgPrepMin,
          categoryId: catMap[p.category],
          restaurantId: rid,
        },
      });
    }
  }

  // Adicionais
  const additionals = [
    { name: 'Leite condensado', price: 2.5, category: 'Sucos' },
    { name: 'Whey / Proteína', price: 6.0, category: 'Sucos' },
    { name: 'Queijo extra', price: 3.0, category: 'Pastéis' },
    { name: 'Bacon', price: 4.0, category: 'Pastéis' },
    { name: 'Borda recheada', price: 5.0, category: 'Mini Pizzas' },
  ];
  for (const a of additionals) {
    const existing = await prisma.additional.findFirst({
      where: { name: a.name, restaurantId: rid, categoryId: catMap[a.category] },
    });
    if (!existing) {
      await prisma.additional.create({
        data: { name: a.name, price: a.price, categoryId: catMap[a.category], restaurantId: rid },
      });
    }
  }

  // Mesas
  for (let n = 1; n <= 20; n++) {
    await prisma.restaurantTable.upsert({
      where: { restaurantId_number: { restaurantId: rid, number: n } },
      update: {},
      create: { number: n, seats: n % 4 === 0 ? 6 : 4, restaurantId: rid },
    });
  }

  const passwordNote = SEED_PASSWORD ? '(senha definida via SEED_PASSWORD)' : `(senha "${DEFAULT_DEV_PASSWORD}" — só para dev local)`;
  console.log('✅ Seed completo.');
  console.log(`   SUPERADMIN: super@gestrest.com ${passwordNote}`);
  console.log(`   Restaurante demo (slug "demo"): admin@ / gerente@ / garcom@ / suqueiro@ / cozinha@ / caixa@ gestrest.com ${passwordNote}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
