/**
 * Ajuste de cima do que merge-frapes-into-sucos-rei-do-suco.js já fez em produção (rodado
 * com a versão anterior, que deixava os 3 sabores com preço fixo direto, sem passo de
 * escolher base). Pedido do cliente/dono: ele quer que o cliente, ao escolher um desses
 * sabores, ainda passe pela Etapa 2 (escolher base) — só que com uma única opção
 * disponível ("Frapê"). Isso já é o que o JuiceBuilder faz sozinho pra qualquer produto
 * nomeado "Fruta (Base)" (ver JuiceBuilder.tsx#groupByFruit) — só falta esse sufixo no nome.
 *
 * Renomeia, só se ainda estiver no nome "avulso" antigo (idempotente — rodar de novo não
 * duplica o "(Frapê)"):
 *   Doce de Leite -> Doce de Leite (Frapê)
 *   Cappuccino    -> Cappuccino (Frapê)
 *   Ovomaltine    -> Ovomaltine (Frapê)
 *
 * Uso:
 *   node dist/scripts/add-frape-base-to-sucos-flavors-rei-do-suco.js --slug=rei-do-suco
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

const OLD_TO_NEW: Record<string, string> = {
  'Doce de Leite': 'Doce de Leite (Frapê)',
  Cappuccino: 'Cappuccino (Frapê)',
  Ovomaltine: 'Ovomaltine (Frapê)',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/add-frape-base-to-sucos-flavors-rei-do-suco.js --slug=rei-do-suco');
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

  let renamed = 0;
  for (const [oldName, newName] of Object.entries(OLD_TO_NEW)) {
    const result = await prisma.product.updateMany({
      where: { restaurantId: rid, categoryId: sucos.id, name: oldName },
      data: { name: newName },
    });
    if (result.count > 0) {
      console.log(`Renomeado: "${oldName}" -> "${newName}".`);
      renamed += result.count;
    }
  }

  if (renamed === 0) {
    console.log('Nenhum produto com o nome antigo encontrado — já estão com "(Frapê)" ou não existem.');
  }
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
