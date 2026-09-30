/**
 * Reverte retire-premade-sweet-pastel-rei-do-suco.ts — o cliente esclareceu que os
 * sabores prontos de pastel doce (Pistache, Brigadeiro, Ferrero Rocher etc.) devem
 * continuar aparecendo normalmente na aba "Pastéis Doces"; a mudança pedida era só
 * dentro do fluxo do "Monte o Seu Pastel Doce" (ver script que ainda está por vir pra
 * isso), não a aba inteira.
 *
 * Reativa (available: true) todo produto da categoria "Pastéis Doces" que não seja o
 * "Monte o Seu Pastel Doce" (isCustom).
 *
 * Idempotente: rodar de novo não faz nada se já estiver tudo ativo.
 *
 * Uso:
 *   node dist/scripts/reactivate-premade-sweet-pastel-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

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
    console.error('Uso: node dist/scripts/reactivate-premade-sweet-pastel-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const category = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Pastéis Doces' } });
  if (!category) {
    console.error('Categoria "Pastéis Doces" não encontrada.');
    process.exit(1);
  }

  const result = await prisma.product.updateMany({
    where: { restaurantId: rid, categoryId: category.id, isCustom: false, available: false },
    data: { available: true },
  });

  console.log(`${result.count} sabor(es) de pastel doce reativado(s).`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
