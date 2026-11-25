/**
 * Bombom separado no Açaí e nos Sucos/Frapês (pedido do dono, 25/11/2026): "o bombom
 * Sonho de Valsa é um item e o Ouro Branco é outro", igual já está no pastel doce.
 *
 * Nas categorias "Açaí e Cupuaçu" e "Sucos":
 *  1. Cria os adicionais "Bombom Ouro Branco" e "Bombom Sonho de Valsa" com o preço do
 *     bombom genérico que já existia ali (R$4,00 se não achar), e copia os insumos dele.
 *  2. Tira do cardápio o bombom genérico ("Bombom" no açaí, "Bombom (2 unidades) — Ouro
 *     Branco ou Sonho de Valsa" nos sucos): apaga se nunca foi vendido, senão arquiva.
 *  3. Tira os PRODUTOS "Bombom ..." que foram cadastrados por engano nessas categorias
 *     (apareciam no site como item solto com "Preço pela montagem"), do mesmo jeito.
 *
 * Arquivar = some do painel e do site, mas a linha fica pro histórico de pedidos.
 * Idempotente: rodar de novo não duplica nada.
 *
 * Uso:
 *   node dist/scripts/split-bombom-additionals-rei-do-suco.js --slug=rei-do-suco --dry-run
 *   node dist/scripts/split-bombom-additionals-rei-do-suco.js --slug=rei-do-suco
 */
import { AdditionalKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_NAMES = ['Bombom Ouro Branco', 'Bombom Sonho de Valsa'];
const DEFAULT_PRICE = 4.0;

function parseArgs(argv: string[]) {
  const out: Record<string, string | true> = {};
  for (const raw of argv) {
    const m = raw.match(/^--([a-zA-Z-]+)(?:=(.*))?$/);
    if (m) out[m[1].toLowerCase()] = m[2] ?? true;
  }
  return out;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const isAcai = (name: string) => /acai/.test(norm(name));
const isSucos = (name: string) => norm(name) === 'sucos';
const isBombom = (name: string) => norm(name).startsWith('bombom');
const isNewName = (name: string) => NEW_NAMES.some((n) => norm(n) === norm(name));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = typeof args.slug === 'string' ? args.slug : '';
  const dry = !!args['dry-run'];
  if (!slug) {
    console.error('Uso: node dist/scripts/split-bombom-additionals-rei-do-suco.js --slug=rei-do-suco [--dry-run]');
    process.exit(1);
  }
  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;
  if (dry) console.log('*** SIMULAÇÃO (--dry-run): nada será gravado ***\n');

  const categories = (await prisma.category.findMany({ where: { restaurantId: rid } })).filter(
    (c) => isAcai(c.name) || isSucos(c.name),
  );
  if (categories.length === 0) {
    console.error('Nenhuma categoria de Açaí ou Sucos encontrada — nada feito.');
    process.exit(1);
  }

  for (const cat of categories) {
    console.log(`== ${cat.name} ==`);
    const additionals = await prisma.additional.findMany({
      where: { restaurantId: rid, categoryId: cat.id, kind: AdditionalKind.ADDON, deletedAt: null },
      include: { ingredients: { select: { id: true } } },
    });
    const generic = additionals.filter((a) => isBombom(a.name) && !isNewName(a.name));
    const price = generic[0] ? Number(generic[0].price) : DEFAULT_PRICE;
    const ingredientIds = [...new Set(generic.flatMap((a) => a.ingredients.map((i) => i.id)))];

    // 1. Os dois bombons separados.
    for (const name of NEW_NAMES) {
      const existing = additionals.find((a) => norm(a.name) === norm(name));
      if (existing) {
        console.log(`  "${existing.name}" já existe (R$${Number(existing.price).toFixed(2)}, ${existing.active ? 'disponível' : 'esgotado'}) — mantido.`);
        continue;
      }
      console.log(`  + cria adicional "${name}" — R$${price.toFixed(2)}${ingredientIds.length ? `, com ${ingredientIds.length} insumo(s) do bombom antigo` : ''}`);
      if (!dry) {
        await prisma.additional.create({
          data: {
            restaurantId: rid,
            categoryId: cat.id,
            name,
            price,
            kind: AdditionalKind.ADDON,
            ...(ingredientIds.length && { ingredients: { connect: ingredientIds.map((id) => ({ id })) } }),
          },
        });
      }
    }

    // 2. Bombom genérico sai do cardápio.
    for (const a of generic) {
      const used = await prisma.orderItemAdditional.count({ where: { additionalId: a.id } });
      console.log(`  - ${used ? 'arquiva' : 'apaga'} adicional "${a.name}"${used ? ` (já vendido ${used}x)` : ''}`);
      if (dry) continue;
      if (used) {
        await prisma.additional.update({
          where: { id: a.id },
          data: { deletedAt: new Date(), active: false, ingredients: { set: [] } },
        });
      } else {
        await prisma.additional.delete({ where: { id: a.id } });
      }
    }

    // 3. Produtos "Bombom ..." cadastrados por engano como item solto.
    const wrongProducts = await prisma.product.findMany({
      where: { restaurantId: rid, categoryId: cat.id, deletedAt: null },
    });
    for (const p of wrongProducts.filter((x) => isBombom(x.name))) {
      const used = await prisma.orderItem.count({ where: { productId: p.id } });
      console.log(`  - ${used ? 'arquiva' : 'apaga'} PRODUTO "${p.name}"${used ? ` (já vendido ${used}x)` : ''}`);
      if (dry) continue;
      if (used) {
        await prisma.product.update({
          where: { id: p.id },
          data: { deletedAt: new Date(), available: false, ingredients: { set: [] }, optionalIngredients: { set: [] } },
        });
      } else {
        await prisma.product.delete({ where: { id: p.id } });
      }
    }
    console.log('');
  }
  console.log(dry ? 'Simulação concluída. Rode sem --dry-run para gravar.' : 'Pronto.');
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
