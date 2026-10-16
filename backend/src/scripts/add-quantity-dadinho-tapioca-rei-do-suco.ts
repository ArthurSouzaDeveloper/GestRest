/**
 * Adiciona a quantidade "(10 unidades)" no nome do produto "Dadinho de Tapioca com Geleia
 * de Pimenta" (categoria Porções) — pedido do cliente: no site público o nome é a única
 * informação visível sobre a porção (não há campo de descrição exibido), então a
 * quantidade entra no próprio nome, mesmo padrão já usado em adicionais como "Bis (2
 * unidades)" (ver import-menu-rei-do-suco.ts#ADICIONAIS_SUCOS).
 *
 * Busca por nome contendo "Dadinho de Tapioca" (não por igualdade exata) pra não falhar
 * caso o nome já tenha sido ajustado manualmente pelo painel. Idempotente: se o nome já
 * terminar com "(10 unidades)", não faz nada.
 *
 * Uso:
 *   node dist/scripts/add-quantity-dadinho-tapioca-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUFFIX = ' (10 unidades)';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/add-quantity-dadinho-tapioca-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const category = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Porções' } });
  if (!category) {
    console.error('Categoria "Porções" não encontrada.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { restaurantId: rid, categoryId: category.id, name: { contains: 'Dadinho de Tapioca' } },
  });

  if (products.length === 0) {
    console.log('Nenhum produto "Dadinho de Tapioca" encontrado na categoria Porções.');
    return;
  }

  for (const p of products) {
    if (p.name.endsWith(SUFFIX)) {
      console.log(`"${p.name}" já tem a quantidade — nada a fazer.`);
      continue;
    }
    const newName = `${p.name}${SUFFIX}`;
    await prisma.product.update({ where: { id: p.id }, data: { name: newName } });
    console.log(`"${p.name}" renomeado para "${newName}".`);
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
