/**
 * Tira do cardápio, a pedido do cliente/dono, os pastéis salgados simples (sabor único) da
 * categoria "Sugestão da Casa e Monte Seu Pastel" — eles ficaram redundantes depois do
 * merge (ver merge-sugestoes-casa-pasteis-salgados-rei-do-suco.ts): o mesmo sabor já está
 * disponível dentro de "Monte o Seu Pastel" (escolha de base), então manter o produto
 * avulso só duplicava a opção no cardápio. Fica só "Monte o Seu Pastel" (isCustom) e as
 * "Sugestões da Casa" (combos).
 *
 * Importante: isso remove só os Product (o item avulso no cardápio). Os Additional do tipo
 * BASE com o mesmo nome continuam intactos — são o que alimenta o seletor de sabor de
 * "Monte o Seu Pastel", que depende deles.
 *
 * Mesmo critério de segurança de productService.remove(): produto já usado em algum pedido
 * não pode ser apagado de verdade (levaria o item do pedido — inclusive venda já paga —
 * junto), então nesse caso só desativa (available=false) em vez de excluir. Sem pedido
 * nenhum no histórico, apaga de vez.
 *
 * Idempotente: rodar de novo não falha se já tiver sido removido/desativado antes.
 *
 * Uso:
 *   node dist/scripts/remove-pasteis-simples-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORY_NAME = 'Sugestão da Casa e Monte Seu Pastel';

// Os 22 sabores simples originais de "Pastéis Salgados" (ver import-menu-rei-do-suco.ts),
// que agora duplicam a escolha de sabor dentro de "Monte o Seu Pastel".
const PASTEIS_SIMPLES = [
  'Salmão',
  'Linguiça',
  'Atum',
  'Pepperoni',
  'Brócolis',
  'Costela',
  'Calabresa',
  'Carne',
  'Carne Seca',
  'Camarão',
  'Frango',
  'Lombo',
  'Picanha',
  'Palmito',
  'Peito de Peru',
  'Pernil',
  'Pizza',
  'Presunto',
  'Mussarela',
  'Salame',
  'Salsicha',
  'Escarola',
];

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
    console.error('Uso: node dist/scripts/remove-pasteis-simples-rei-do-suco.js --slug=rei-do-suco');
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
    console.error(`Categoria "${CATEGORY_NAME}" não encontrada para "${restaurant.name}".`);
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { restaurantId: rid, categoryId: category.id, isCustom: false, name: { in: PASTEIS_SIMPLES } },
  });

  if (products.length === 0) {
    console.log('Nenhum pastel simples encontrado nessa categoria — já removidos ou nunca existiram.');
  }

  for (const p of products) {
    const orderItemCount = await prisma.orderItem.count({ where: { productId: p.id } });
    if (orderItemCount > 0) {
      await prisma.product.update({ where: { id: p.id }, data: { available: false } });
      console.log(`Produto "${p.name}" já foi usado em pedido(s) — marcado como indisponível (não apagado).`);
    } else {
      await prisma.product.delete({ where: { id: p.id } });
      console.log(`Produto "${p.name}" removido (nunca foi pedido).`);
    }
  }

  console.log(`Concluído: ${products.length} pastel(éis) simples processado(s).`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
