/**
 * Adiciona o adicional "Barbecue" (molho) que o cliente pediu e não existia. Vai pra toda
 * categoria que já tem o "Molho de Alho" como adicional (Pastéis Salgados, Mini Pizza
 * Salgada etc., ver ADICIONAIS_SALGADOS em import-menu-rei-do-suco.ts), com o mesmo preço
 * dele: R$2,00.
 *
 * Idempotente: cada adicional é identificado por (restaurantId, categoryId, name, kind) —
 * mesmo critério de import-menu-rei-do-suco.ts#ensureAdditional. Rodar de novo não duplica.
 *
 * Uso:
 *   node dist/scripts/add-barbecue-additional-rei-do-suco.js --slug=rei-do-suco
 */
import { AdditionalKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NAME = 'Barbecue';
const PRICE = 2.0;
const REFERENCE = 'Molho de Alho';

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
    console.error('Uso: node dist/scripts/add-barbecue-additional-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const refs = await prisma.additional.findMany({
    where: { restaurantId: rid, name: REFERENCE, kind: AdditionalKind.ADDON, active: true, categoryId: { not: null } },
    include: { category: { select: { name: true } } },
  });
  if (refs.length === 0) {
    console.error(`Nenhuma categoria com o adicional "${REFERENCE}" — nada feito.`);
    process.exit(1);
  }

  for (const ref of refs) {
    const categoryName = ref.category?.name ?? ref.categoryId;
    const existing = await prisma.additional.findFirst({
      where: { restaurantId: rid, categoryId: ref.categoryId, name: NAME, kind: AdditionalKind.ADDON },
    });
    if (existing) {
      await prisma.additional.update({ where: { id: existing.id }, data: { active: true } });
      console.log(`"${NAME}" já existia em ${categoryName} — mantido (ativo).`);
      continue;
    }
    await prisma.additional.create({
      data: { restaurantId: rid, categoryId: ref.categoryId, name: NAME, price: PRICE, kind: AdditionalKind.ADDON },
    });
    console.log(`"${NAME}" criado em ${categoryName} — R$2,00.`);
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
