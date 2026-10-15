/**
 * Desfaz a categoria "Frapês" (criada por reorder-categories-add-frapes-rei-do-suco.ts) —
 * pedido do cliente/dono: a aba separada confundia, os 3 sabores devem aparecer dentro de
 * "Sucos" igual qualquer fruta — fruta + base, só que com uma única base disponível
 * ("Frapê"), em vez de preço fixo direto. Ver JuiceBuilder.tsx#groupByFruit: um produto
 * nomeado "Fruta (Base)" entra no fluxo normal de "escolha a fruta -> escolha a base";
 * com uma base só, a Etapa 2 mostra um único botão "Frapê" pra tocar.
 *
 * Renomeia ao mover (vira "Fruta (Frapê)" — mesmo padrão do importador de sucos):
 *   Frapê Doce de Leite              -> Doce de Leite (Frapê)
 *   Frappuccino (frapê de cappuccino) -> Cappuccino (Frapê)
 *   Frapê de Ovomaltine              -> Ovomaltine (Frapê)
 *
 * No fim, apaga a categoria "Frapês" (fica vazia depois da mudança acima).
 *
 * Idempotente: se "Frapês" já não existir (rodou antes), só confere se os 3 produtos
 * (pelo nome novo) já estão em "Sucos" e sai sem erro. Seguro rodar de novo.
 *
 * Uso:
 *   node dist/scripts/merge-frapes-into-sucos-rei-do-suco.js --slug=rei-do-suco
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

const RENAME: Record<string, string> = {
  'Frapê Doce de Leite': 'Doce de Leite (Frapê)',
  'Frappuccino (frapê de cappuccino)': 'Cappuccino (Frapê)',
  'Frapê de Ovomaltine': 'Ovomaltine (Frapê)',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/merge-frapes-into-sucos-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const sucos = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Sucos' } });
  if (!sucos) {
    console.error('Categoria "Sucos" não encontrada — nada a fazer.');
    process.exit(1);
  }

  const frapes = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Frapês' } });
  if (!frapes) {
    console.log('Categoria "Frapês" já não existe — nada a fazer (script já rodou antes).');
    return;
  }

  const products = await prisma.product.findMany({ where: { restaurantId: rid, categoryId: frapes.id } });
  for (const p of products) {
    const cleaned = p.name.replace(/^Frapê (?:de )?/i, '').replace(/\s*\(frapê[^)]*\)\s*$/i, '').trim();
    const newName = RENAME[p.name] ?? `${cleaned} (Frapê)`;
    await prisma.product.update({ where: { id: p.id }, data: { categoryId: sucos.id, name: newName } });
    console.log(`Movido: "${p.name}" -> Sucos, como "${newName}".`);
  }

  const additionals = await prisma.additional.findMany({ where: { restaurantId: rid, categoryId: frapes.id } });
  for (const a of additionals) {
    await prisma.additional.update({ where: { id: a.id }, data: { categoryId: sucos.id } });
    console.log(`Adicional movido: "${a.name}" -> Sucos.`);
  }

  await prisma.category.delete({ where: { id: frapes.id } });
  console.log('Categoria "Frapês" removida.');
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
