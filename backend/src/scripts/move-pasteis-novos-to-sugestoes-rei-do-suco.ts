/**
 * Move "Frango Premium" e "O Rei do Sertão" de "Pastéis Salgados" pra "Sugestões da Casa"
 * — pedido explícito do cliente/dono. Os dois foram criados em Pastéis Salgados por
 * add-pasteis-novos-rei-do-suco.ts; este script só reatribui a categoria (categoryId),
 * sem apagar/recriar o produto — preserva histórico de pedidos antigos que já usaram esse
 * produto (eles continuam apontando pro mesmo id, só a categoria muda).
 *
 * Nenhum dos dois tem adicional BASE espelhado (só os sabores do import original de
 * Pastéis Salgados viram base do "Monte o Seu Pastel" — ver import-menu-rei-do-suco.ts),
 * então não há nada além do Product pra mover.
 *
 * Idempotente: se o produto já estiver em "Sugestões da Casa" (rodou antes), não faz nada;
 * se não existir em categoria nenhuma, avisa em vez de falhar.
 *
 * Uso:
 *   node dist/scripts/move-pasteis-novos-to-sugestoes-rei-do-suco.js --slug=rei-do-suco
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

const NOMES = ['Frango Premium', 'O Rei do Sertão'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/move-pasteis-novos-to-sugestoes-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const salgados = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Pastéis Salgados' } });
  const sugestoes = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Sugestões da Casa' } });
  if (!salgados || !sugestoes) {
    console.error('Categoria "Pastéis Salgados" ou "Sugestões da Casa" não encontrada.');
    process.exit(1);
  }

  let moved = 0;
  let alreadyThere = 0;
  for (const name of NOMES) {
    const inSalgados = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId: salgados.id, name } });
    if (inSalgados) {
      await prisma.product.update({ where: { id: inSalgados.id }, data: { categoryId: sugestoes.id } });
      moved++;
      console.log(`  → "${name}" movido de Pastéis Salgados pra Sugestões da Casa.`);
      continue;
    }
    const inSugestoes = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId: sugestoes.id, name } });
    if (inSugestoes) {
      alreadyThere++;
    } else {
      console.warn(`  [aviso] "${name}" não encontrado em nenhuma das duas categorias.`);
    }
  }

  console.log(`${moved} produto(s) movido(s), ${alreadyThere} já estava(m) em Sugestões da Casa.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
