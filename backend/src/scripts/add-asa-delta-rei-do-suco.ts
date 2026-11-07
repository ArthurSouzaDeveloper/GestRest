/**
 * Adiciona o pastel "Asa Delta" (pastel de vento) a R$7,00 no cardápio de "O Rei do Suco",
 * pedido do cliente/dono em novembro/2026.
 *
 * Vai pra categoria dos pastéis salgados, hoje chamada "Sugestão da Casa e Monte Seu Pastel"
 * (ver merge-sugestoes-casa-pasteis-salgados-rei-do-suco.ts). Como os adicionais são por
 * categoria, ele já oferece os mesmos adicionais dos outros pastéis salgados (molhos,
 * coberturas), sem cadastro extra.
 *
 * Idempotente: identifica o produto por (restaurante, categoria, nome). Rodar de novo não
 * duplica; se já existir, só acerta preço/descrição e volta a deixar disponível.
 *
 * Uso:
 *   node dist/scripts/add-asa-delta-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORY_NAME = 'Sugestão da Casa e Monte Seu Pastel';
const NAME = 'Asa Delta';
const DESCRIPTION = 'Pastel de vento.';
const PRICE = 7;
// Mesmo tempo médio dos demais pastéis (ver import-menu-rei-do-suco.ts).
const AVG_PREP_MIN = 12;

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
    console.error('Uso: node dist/scripts/add-asa-delta-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const category = await prisma.category.findFirst({ where: { restaurantId: rid, name: CATEGORY_NAME } });
  if (!category) {
    console.error(`Categoria "${CATEGORY_NAME}" não encontrada.`);
    process.exit(1);
  }

  const existing = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId: category.id, name: NAME } });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: { description: DESCRIPTION, price: PRICE, available: true },
    });
    console.log(`"${NAME}" já existia: preço acertado pra R$ ${PRICE.toFixed(2)} e marcado como disponível.`);
    return;
  }

  await prisma.product.create({
    data: {
      restaurantId: rid,
      categoryId: category.id,
      name: NAME,
      description: DESCRIPTION,
      price: PRICE,
      avgPrepMin: AVG_PREP_MIN,
    },
  });
  console.log(`+ ${NAME} (${CATEGORY_NAME}) — R$ ${PRICE.toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
