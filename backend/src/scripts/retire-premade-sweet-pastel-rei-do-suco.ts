/**
 * Retira do cardápio os pastéis doces JÁ MONTADOS (sabores fixos, ex.: "Pistache",
 * "Brigadeiro", "Ferrero Rocher"...) — pedido do cliente: a aba "Pastéis Doces" deve
 * mostrar só o "Monte o Seu Pastel Doce" (produto isCustom) com os adicionais, sem os
 * sabores prontos concorrendo na mesma lista.
 *
 * Marca `available: false` em vez de apagar (mesmo padrão já usado pro "Monte a Sua Mini
 * Pizza" em import-menu-rei-do-suco.ts) — preserva o histórico de pedidos antigos que já
 * usaram esses sabores.
 *
 * NÃO mexe nos adicionais BASE (sabor-base espelhado dos pastéis doces, ver
 * import-menu-rei-do-suco.ts#PASTEIS_DOCES) — são o mecanismo que o "Monte o Seu Pastel
 * Doce" usa pra escolher o sabor-base dentro do modal; continuam ativos, senão o próprio
 * "Monte o Seu" ficaria sem opção de sabor.
 *
 * Idempotente: rodar de novo não reativa nada nem falha se já estiver tudo desativado.
 *
 * Uso:
 *   node dist/scripts/retire-premade-sweet-pastel-rei-do-suco.js --slug=rei-do-suco
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
    console.error('Uso: node dist/scripts/retire-premade-sweet-pastel-rei-do-suco.js --slug=rei-do-suco');
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

  const premade = await prisma.product.findMany({
    where: { restaurantId: rid, categoryId: category.id, isCustom: false, available: true },
  });

  for (const p of premade) {
    await prisma.product.update({ where: { id: p.id }, data: { available: false } });
  }

  console.log(`${premade.length} sabor(es) de pastel doce já montado desativado(s). "Monte o Seu Pastel Doce" continua ativo.`);
  if (premade.length > 0) {
    console.log('\nDesativados:');
    for (const p of premade) console.log(`  - ${p.name}`);
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
