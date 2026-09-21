/**
 * Duas mudanças de cardápio pedidas pelo cliente:
 *
 * 1. Reordena as categorias de comida: Pastéis Salgados, Pastéis Doces, Mini Pizza
 *    Salgada, Mini Pizza Doce, Porções, Sugestões da Casa (nessa ordem) — a ordem de
 *    hoje (Porções, Pastéis Salgados, Sugestões da Casa, Pastéis Doces, Mini Pizza
 *    Salgada, Mini Pizza Doce) vem de import-menu-rei-do-suco.ts.
 * 2. Cria a categoria "Frapês" (estação Suqueiros) e move os 3 sabores de frapê que
 *    hoje ficam dentro de "Sucos" (Frapê Doce de Leite, Frappuccino, Frapê de
 *    Ovomaltine — ver FRAPES_NOVIDADE em import-menu-rei-do-suco.ts) pra lá, deixando a
 *    aba "Sucos" só com suco de fruta de verdade.
 *
 * Idempotente: reordenar pro mesmo valor não muda nada; mover um produto que já está
 * na categoria nova não faz nada; rodar de novo não recria a categoria "Frapês".
 *
 * Uso:
 *   node dist/scripts/reorder-categories-add-frapes-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient, Station } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

// Só reordena categorias que já existem (não cria nenhuma, exceto Frapês abaixo).
const NEW_SORT_ORDER: Record<string, number> = {
  'Pastéis Salgados': 1,
  'Pastéis Doces': 2,
  'Mini Pizza Salgada': 3,
  'Mini Pizza Doce': 4,
  Porções: 5,
  'Sugestões da Casa': 6,
  Sucos: 7,
  'Açaí e Cupuaçu': 9,
  Bebidas: 10,
};
const FRAPES_SORT_ORDER = 8; // logo depois de Sucos, antes de Açaí/Bebidas

const FRAPE_PRODUCT_NAMES = ['Frapê Doce de Leite', 'Frappuccino (frapê de cappuccino)', 'Frapê de Ovomaltine'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/reorder-categories-add-frapes-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  for (const [name, sortOrder] of Object.entries(NEW_SORT_ORDER)) {
    const updated = await prisma.category.updateMany({ where: { restaurantId: rid, name }, data: { sortOrder } });
    if (updated.count === 0) {
      console.warn(`[aviso] Categoria "${name}" não encontrada — pulei o reordenamento dela.`);
    }
  }

  let frapes = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Frapês' } });
  if (!frapes) {
    frapes = await prisma.category.create({
      data: { restaurantId: rid, name: 'Frapês', station: Station.JUICE_BAR, sortOrder: FRAPES_SORT_ORDER },
    });
    console.log('Categoria "Frapês" criada.');
  } else {
    await prisma.category.update({ where: { id: frapes.id }, data: { sortOrder: FRAPES_SORT_ORDER } });
    console.log('Categoria "Frapês" já existia — sortOrder conferido.');
  }

  let moved = 0;
  for (const name of FRAPE_PRODUCT_NAMES) {
    const result = await prisma.product.updateMany({
      where: { restaurantId: rid, name, categoryId: { not: frapes.id } },
      data: { categoryId: frapes.id },
    });
    moved += result.count;
  }
  console.log(`${moved} produto(s) movido(s) para "Frapês".`);

  const finalCategories = await prisma.category.findMany({ where: { restaurantId: rid }, orderBy: { sortOrder: 'asc' } });
  console.log('\nOrdem final das categorias:');
  for (const c of finalCategories) console.log(`  ${c.sortOrder}. ${c.name}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
