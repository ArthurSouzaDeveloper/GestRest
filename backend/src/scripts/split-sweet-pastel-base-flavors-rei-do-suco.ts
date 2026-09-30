/**
 * Separa as 2 opções de sabor de "Pastéis Doces" que hoje juntam 2 escolhas num só nome
 * com "ou" (ex.: "Bis Branco ou Preto") em produtos/bases individuais — pedido explícito
 * do cliente: cada sabor precisa aparecer como opção própria, nunca um "ou" que obrigue
 * escolher 2 coisas debaixo do mesmo item. Cobre os 2 únicos casos da categoria (revisão
 * completa de PASTEIS_DOCES em import-menu-rei-do-suco.ts confirmou que não há outro
 * nome de sabor com "ou" além destes 2 — "Talento" menciona "Avelã ou Castanha do Pará"
 * só na descrição de um sabor único, não é uma escolha entre 2 itens de cardápio):
 *
 *   "Bis Branco ou Preto"                  -> "Bis Branco" + "Bis Preto"
 *   "Bombom Ouro Branco ou Sonho de Valsa" -> "Bombom Ouro Branco" + "Bombom Sonho de Valsa"
 *
 * Cada sabor combinado existe em 2 lugares (import-menu-rei-do-suco.ts#PASTEIS_DOCES):
 *   - Product (isCustom: false) — aparece na aba "Pastéis Doces" pro cliente pedir direto.
 *   - Additional (kind: BASE) — é a opção de sabor-base dentro do "Monte o Seu Pastel Doce".
 * Os 2 precisam ser desativados/criados juntos, senão a lista de bases do builder e a
 * lista de sabores prontos da aba ficam inconsistentes entre si.
 *
 * Desativa (available/active: false) em vez de apagar — mesmo padrão do resto do script,
 * preserva o histórico de pedidos antigos que já usaram o nome combinado.
 *
 * Idempotente: rodar de novo não duplica os novos nem tenta desativar quem já está
 * desativado.
 *
 * Uso:
 *   node dist/scripts/split-sweet-pastel-base-flavors-rei-do-suco.js --slug=rei-do-suco
 */
import { AdditionalKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

const SPLITS: { merged: string; price: number; into: string[] }[] = [
  { merged: 'Bis Branco ou Preto', price: 16.0, into: ['Bis Branco', 'Bis Preto'] },
  {
    merged: 'Bombom Ouro Branco ou Sonho de Valsa',
    price: 16.0,
    into: ['Bombom Ouro Branco', 'Bombom Sonho de Valsa'],
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/split-sweet-pastel-base-flavors-rei-do-suco.js --slug=rei-do-suco');
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
  const categoryId = category.id;

  let deactivatedProducts = 0;
  let deactivatedBases = 0;
  let createdProducts = 0;
  let createdBases = 0;

  for (const { merged, price, into } of SPLITS) {
    const product = await prisma.product.findFirst({
      where: { restaurantId: rid, categoryId, name: merged, isCustom: false },
    });
    if (product?.available) {
      await prisma.product.update({ where: { id: product.id }, data: { available: false } });
      deactivatedProducts++;
    }

    const base = await prisma.additional.findFirst({
      where: { restaurantId: rid, categoryId, name: merged, kind: AdditionalKind.BASE },
    });
    if (base?.active) {
      await prisma.additional.update({ where: { id: base.id }, data: { active: false } });
      deactivatedBases++;
    }

    for (const name of into) {
      const existingProduct = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId, name } });
      if (!existingProduct) {
        await prisma.product.create({
          data: { restaurantId: rid, categoryId, name, price, avgPrepMin: 12 },
        });
        createdProducts++;
      } else if (!existingProduct.available) {
        await prisma.product.update({ where: { id: existingProduct.id }, data: { available: true } });
      }

      const existingBase = await prisma.additional.findFirst({
        where: { restaurantId: rid, categoryId, name, kind: AdditionalKind.BASE },
      });
      if (!existingBase) {
        await prisma.additional.create({
          data: { restaurantId: rid, categoryId, name, price, kind: AdditionalKind.BASE },
        });
        createdBases++;
      } else if (!existingBase.active) {
        await prisma.additional.update({ where: { id: existingBase.id }, data: { active: true } });
      }
    }
  }

  console.log(
    `Produtos: ${deactivatedProducts} desativado(s), ${createdProducts} criado(s). ` +
      `Bases: ${deactivatedBases} desativada(s), ${createdBases} criada(s).`,
  );
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
