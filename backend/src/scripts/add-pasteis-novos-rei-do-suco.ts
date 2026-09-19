/**
 * Adiciona 4 sabores novos de pastel ao cardápio de "O Rei do Suco" (setembro/2026):
 * Frango Premium e O Rei do Sertão em Pastéis Salgados; Cheesecake e Morango Cravejado
 * em Pastéis Doces.
 *
 * Idempotente: rodar de novo não duplica (checa por nome dentro da categoria antes de
 * criar) — mesmo padrão de import-menu-rei-do-suco.ts.
 *
 * Uso:
 *   node dist/scripts/add-pasteis-novos-rei-do-suco.js --slug=rei-do-suco
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

const PASTEIS_SALGADOS_NOVOS: [string, string, number][] = [
  ['Frango Premium', 'Frango, geleia de pimenta, bacon, queijo e cream cheese.', 22],
  ['O Rei do Sertão', 'Carne seca temperada com cebolinha, queijo coalho, geleia de pimenta e cream cheese.', 33],
];

const PASTEIS_DOCES_NOVOS: [string, string, number][] = [
  ['Cheesecake', 'Cream cheese, geleia de frutas vermelhas, morangos e chocolate branco.', 25],
  ['Morango Cravejado', 'Morangos, açúcar cravejado, creme de leite em pó e chocolate branco.', 23],
];

async function ensureProduct(
  restaurantId: string,
  categoryId: string,
  name: string,
  description: string,
  price: number,
) {
  const existing = await prisma.product.findFirst({ where: { restaurantId, categoryId, name } });
  if (existing) return { created: false };
  // avgPrepMin: 12 — mesmo valor usado pros demais pastéis salgados/doces em
  // import-menu-rei-do-suco.ts.
  await prisma.product.create({ data: { restaurantId, categoryId, name, description, price, avgPrepMin: 12 } });
  return { created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/add-pasteis-novos-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const salgados = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Pastéis Salgados' } });
  const doces = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Pastéis Doces' } });
  if (!salgados || !doces) {
    console.error('❌ Categoria "Pastéis Salgados" ou "Pastéis Doces" não encontrada — rode o import do cardápio primeiro.');
    process.exit(1);
  }

  let created = 0;
  for (const [name, description, price] of PASTEIS_SALGADOS_NOVOS) {
    if ((await ensureProduct(rid, salgados.id, name, description, price)).created) {
      created++;
      console.log(`  + ${name} (Pastéis Salgados) — R$ ${price.toFixed(2)}`);
    }
  }
  for (const [name, description, price] of PASTEIS_DOCES_NOVOS) {
    if ((await ensureProduct(rid, doces.id, name, description, price)).created) {
      created++;
      console.log(`  + ${name} (Pastéis Doces) — R$ ${price.toFixed(2)}`);
    }
  }

  console.log(`✅ ${created} sabor(es) novo(s) adicionado(s) (os já existentes foram ignorados).`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
