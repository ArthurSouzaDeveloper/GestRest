import { PrismaClient, Role, Station } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding GestRest...');

  const hash = (p: string) => bcrypt.hashSync(p, 10);

  // ── Users (one per role) ──
  const users: { name: string; email: string; role: Role }[] = [
    { name: 'Administrador', email: 'admin@gestrest.com', role: Role.ADMIN },
    { name: 'Gerente', email: 'gerente@gestrest.com', role: Role.MANAGER },
    { name: 'Garçom João', email: 'garcom@gestrest.com', role: Role.WAITER },
    { name: 'Suqueiro Ana', email: 'suqueiro@gestrest.com', role: Role.JUICER },
    { name: 'Cozinheiro Pedro', email: 'cozinha@gestrest.com', role: Role.COOK },
    { name: 'Caixa Maria', email: 'caixa@gestrest.com', role: Role.CASHIER },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: hash('123456') },
    });
  }

  // ── Categories with station routing ──
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
      where: { name: c.name },
      update: { station: c.station, sortOrder: c.sortOrder },
      create: c,
    });
    catMap[c.name] = cat.id;
  }

  // ── Products ──
  const products = [
    { name: 'Suco de Laranja', category: 'Sucos', price: 9.9, avgPrepMin: 5 },
    { name: 'Suco de Morango', category: 'Sucos', price: 11.9, avgPrepMin: 5 },
    { name: 'Suco de Maracujá', category: 'Sucos', price: 10.9, avgPrepMin: 5 },
    { name: 'Vitamina de Banana', category: 'Sucos', price: 12.9, avgPrepMin: 7 },
    { name: 'Coca-Cola Lata', category: 'Refrigerantes', price: 6.0, avgPrepMin: 1 },
    { name: 'Guaraná Lata', category: 'Refrigerantes', price: 6.0, avgPrepMin: 1 },
    { name: 'Água Mineral 500ml', category: 'Água', price: 4.0, avgPrepMin: 1 },
    { name: 'Pastel de Carne', category: 'Pastéis', price: 8.5, avgPrepMin: 12 },
    { name: 'Pastel de Queijo', category: 'Pastéis', price: 8.5, avgPrepMin: 12 },
    { name: 'Pastel de Frango c/ Catupiry', category: 'Pastéis', price: 9.5, avgPrepMin: 14 },
    { name: 'Mini Pizza Calabresa', category: 'Mini Pizzas', price: 15.9, avgPrepMin: 15 },
    { name: 'Mini Pizza Mussarela', category: 'Mini Pizzas', price: 14.9, avgPrepMin: 15 },
    { name: 'Mini Pizza Portuguesa', category: 'Mini Pizzas', price: 16.9, avgPrepMin: 16 },
    { name: 'Petit Gateau', category: 'Sobremesas', price: 13.9, avgPrepMin: 10 },
  ];
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.product.create({
        data: {
          name: p.name,
          price: p.price,
          avgPrepMin: p.avgPrepMin,
          categoryId: catMap[p.category],
        },
      });
    }
  }

  // ── Additionals ──
  const additionals = [
    { name: 'Leite condensado', price: 2.5, category: 'Sucos' },
    { name: 'Whey / Proteína', price: 6.0, category: 'Sucos' },
    { name: 'Mel', price: 2.0, category: 'Sucos' },
    { name: 'Polpa extra', price: 3.0, category: 'Sucos' },
    { name: 'Queijo extra', price: 3.0, category: 'Pastéis' },
    { name: 'Cheddar', price: 3.5, category: 'Pastéis' },
    { name: 'Catupiry', price: 3.5, category: 'Pastéis' },
    { name: 'Bacon', price: 4.0, category: 'Pastéis' },
    { name: 'Ovo', price: 2.0, category: 'Pastéis' },
    { name: 'Borda recheada', price: 5.0, category: 'Mini Pizzas' },
    { name: 'Queijo extra', price: 4.0, category: 'Mini Pizzas' },
    { name: 'Calabresa extra', price: 4.5, category: 'Mini Pizzas' },
  ];
  for (const a of additionals) {
    const existing = await prisma.additional.findFirst({
      where: { name: a.name, categoryId: catMap[a.category] },
    });
    if (!existing) {
      await prisma.additional.create({
        data: { name: a.name, price: a.price, categoryId: catMap[a.category] },
      });
    }
  }

  // ── Tables ──
  for (let n = 1; n <= 20; n++) {
    await prisma.restaurantTable.upsert({
      where: { number: n },
      update: {},
      create: { number: n, seats: n % 4 === 0 ? 6 : 4 },
    });
  }

  console.log('✅ Seed complete.');
  console.log('   Users (senha: 123456): admin@, gerente@, garcom@, suqueiro@, cozinha@, caixa@ gestrest.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
