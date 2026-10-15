/**
 * Tira do cardápio, a pedido do cliente/dono:
 *   - Produto "Mini Pastéis / Sabores Misto (queijo, presunto e queijo e calabresa)" (Porções)
 *   - Adicional "Guacamole Apimentada 200ml" (em QUALQUER categoria onde exista — hoje
 *     pode estar duplicado em mais de uma categoria de pastel/mini pizza, ver
 *     ADICIONAIS_SALGADOS em import-menu-rei-do-suco.ts)
 *
 * Mesmo critério de segurança de productService.remove()/additionalService.remove(): um
 * item já usado em algum pedido não pode ser apagado de verdade (levaria o item do pedido
 * — inclusive venda já paga — junto), então nesse caso só desativa (available=false /
 * active=false) em vez de excluir. Sem pedido nenhum no histórico, apaga de vez.
 *
 * Idempotente: rodar de novo não falha se já tiver sido removido/desativado antes.
 *
 * Uso:
 *   node dist/scripts/remove-mini-pasteis-guacamole-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRODUCT_NAME = 'Mini Pastéis / Sabores Misto (queijo, presunto e queijo e calabresa)';
const ADDITIONAL_NAME = 'Guacamole Apimentada 200ml';

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
    console.error('Uso: node dist/scripts/remove-mini-pasteis-guacamole-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const products = await prisma.product.findMany({ where: { restaurantId: rid, name: PRODUCT_NAME } });
  if (products.length === 0) {
    console.log(`Produto "${PRODUCT_NAME}" não encontrado — já removido ou nunca existiu.`);
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

  const additionals = await prisma.additional.findMany({ where: { restaurantId: rid, name: ADDITIONAL_NAME } });
  if (additionals.length === 0) {
    console.log(`Adicional "${ADDITIONAL_NAME}" não encontrado — já removido ou nunca existiu.`);
  }
  for (const a of additionals) {
    const orderItemAdditionalCount = await prisma.orderItemAdditional.count({ where: { additionalId: a.id } });
    if (orderItemAdditionalCount > 0) {
      await prisma.additional.update({ where: { id: a.id }, data: { active: false } });
      console.log(`Adicional "${a.name}" (categoria ${a.categoryId}) já foi usado em pedido(s) — marcado como inativo (não apagado).`);
    } else {
      await prisma.additional.delete({ where: { id: a.id } });
      console.log(`Adicional "${a.name}" (categoria ${a.categoryId}) removido (nunca foi pedido).`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
