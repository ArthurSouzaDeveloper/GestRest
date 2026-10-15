/**
 * Desfaz a categoria "Frapês" (criada por reorder-categories-add-frapes-rei-do-suco.ts) —
 * pedido do cliente/dono: a aba separada confundia, os 3 sabores devem aparecer dentro de
 * "Sucos" como sabor avulso ("Sabores especiais" no site público — ver
 * JuiceBuilder.tsx#groupByFruit, que já trata produtos sem o padrão "Fruta (Base)" assim).
 *
 * Renomeia ao mover (tira o prefixo/sufixo "Frapê"):
 *   Frapê Doce de Leite              -> Doce de Leite
 *   Frappuccino (frapê de cappuccino) -> Cappuccino
 *   Frapê de Ovomaltine              -> Ovomaltine
 * O novo nome "Cappuccino" (sem parênteses) é proposital: um nome com "Algo (Algo)" seria
 * lido pelo JuiceBuilder como fruta+base de um combo de verdade, não como sabor avulso.
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
  'Frapê Doce de Leite': 'Doce de Leite',
  'Frappuccino (frapê de cappuccino)': 'Cappuccino',
  'Frapê de Ovomaltine': 'Ovomaltine',
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
    const newName = RENAME[p.name] ?? p.name.replace(/^Frapê (?:de )?/i, '').replace(/\s*\(frapê[^)]*\)\s*$/i, '').trim();
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
