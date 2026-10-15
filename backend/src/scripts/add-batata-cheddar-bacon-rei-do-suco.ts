/**
 * Adiciona "Batata Frita com Cheddar e Bacon" à categoria Porções (pedido do cliente/dono,
 * R$29,00) e aproveita pra anotar o peso aproximado nas duas batatas, que aparece como
 * legenda cinza embaixo do nome no cardápio (ver OrderComposer.tsx, campo description):
 *   Batata Frita                      -> ~300g (preço e nome ficam como já estavam)
 *   Batata Frita com Cheddar e Bacon  -> novo item, R$29,00, ~450g
 *
 * Idempotente: não duplica "Batata Frita com Cheddar e Bacon" se já existir; sempre
 * reescreve a descrição de peso das duas (seguro rodar de novo).
 *
 * Uso:
 *   node dist/scripts/add-batata-cheddar-bacon-rei-do-suco.js --slug=rei-do-suco
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
    console.error('Uso: node dist/scripts/add-batata-cheddar-bacon-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const porcoes = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Porções' } });
  if (!porcoes) {
    console.error('Categoria "Porções" não encontrada.');
    process.exit(1);
  }

  const batataSimples = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId: porcoes.id, name: 'Batata Frita' } });
  if (batataSimples) {
    await prisma.product.update({ where: { id: batataSimples.id }, data: { description: 'Aproximadamente 300g' } });
    console.log('"Batata Frita" — descrição de peso atualizada (~300g).');
  } else {
    console.warn('[aviso] "Batata Frita" não encontrada em Porções — pulei a atualização de peso dela.');
  }

  const existing = await prisma.product.findFirst({
    where: { restaurantId: rid, categoryId: porcoes.id, name: 'Batata Frita com Cheddar e Bacon' },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: { price: 29.0, description: 'Aproximadamente 450g' },
    });
    console.log('"Batata Frita com Cheddar e Bacon" já existia — preço/descrição conferidos.');
  } else {
    await prisma.product.create({
      data: {
        restaurantId: rid,
        categoryId: porcoes.id,
        name: 'Batata Frita com Cheddar e Bacon',
        price: 29.0,
        avgPrepMin: 15,
        description: 'Aproximadamente 450g',
      },
    });
    console.log('"Batata Frita com Cheddar e Bacon" criada — R$29,00, ~450g.');
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
