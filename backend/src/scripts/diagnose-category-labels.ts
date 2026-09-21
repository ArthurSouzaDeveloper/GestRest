/**
 * Diagnóstico: lista as categorias de um restaurante e o prefixo (Pastel Salgado/Doce,
 * Mini Pizza Salgada/Doce, Porção) que a impressão calcularia pra cada uma — ver
 * printJobService.categoryTypeLabel. Usado pra achar por que uma categoria específica
 * não está saindo com prefixo no ticket, sem precisar adivinhar o nome exato cadastrado.
 *
 * Uso:
 *   node dist/scripts/diagnose-category-labels.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';
import { categoryTypeLabel } from '../application/services/printJob.service';

const prisma = new PrismaClient();

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
    console.error('Uso: node dist/scripts/diagnose-category-labels.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }

  const categories = await prisma.category.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { name: 'asc' },
  });

  console.log(`Categorias de "${restaurant.name}":\n`);
  for (const c of categories) {
    const label = categoryTypeLabel(c.name);
    console.log(`- "${c.name}"  ->  ${label ? `prefixo no ticket: "${label}"` : 'SEM PREFIXO (nome não reconhecido)'}`);
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
