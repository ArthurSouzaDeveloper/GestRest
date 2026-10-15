/**
 * Troca o nome de um restaurante já cadastrado (ex.: "Rei do Suco" → "O Rei do Suco") — o
 * nome aparece na capa do site público de pedidos (ver PublicOrder.tsx#IntroStep) e em
 * outras telas que mostram `restaurant.name`. Idempotente: gravar o mesmo nome de novo não
 * tem efeito colateral, seguro rodar mais de uma vez.
 *
 * Uso:
 *   node dist/scripts/rename-restaurant.js --slug=rei-do-suco --name="O Rei do Suco"
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=([\s\S]*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  const name = args.name?.trim();
  if (!slug || !name) {
    console.error('Uso: node dist/scripts/rename-restaurant.js --slug=rei-do-suco --name="O Rei do Suco"');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }

  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { name } });

  console.log(`✅ Nome de "${restaurant.name}" atualizado para "${name}".`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
