/**
 * Sugere (e, se mandarem, cadastra) os insumos de "O Rei do Suco" lendo o cardápio:
 * a base dos sucos ("Morango (Laranja)" → Laranja, essencial) e as receitas dos produtos
 * ("frango, milho e ovo" → Milho, Ovo: "dá pra tirar"). Regras em
 * application/services/ingredientSuggestions.ts.
 *
 * SIMULAÇÃO POR PADRÃO: sem --apply, só imprime o que faria e não grava nada.
 * Com --apply é ADITIVO e idempotente: cria o insumo que não existe (em estoque), liga o
 * que ainda não está ligado, e nunca desliga, nem muda estoque ou o tipo de um vínculo
 * que já existe. Rodar de novo não duplica.
 *
 * Uso:
 *   node dist/scripts/suggest-ingredients-rei-do-suco.js --slug=rei-do-suco
 *   node dist/scripts/suggest-ingredients-rei-do-suco.js --slug=rei-do-suco --min=2 --only=laranja,milho,ervilha
 *   node dist/scripts/suggest-ingredients-rei-do-suco.js --slug=rei-do-suco --only=laranja,milho --apply
 *
 * --min=N   só insumos que aparecem em pelo menos N produtos (padrão 2)
 * --only=a,b  só esses insumos (sem acento/maiúscula tanto faz)
 */
import { PrismaClient } from '@prisma/client';
import { normalizeText, suggestIngredientsFromMenu } from '../application/services/ingredientSuggestions';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)(?:=(.*))?$/);
    if (match) out[match[1].toLowerCase()] = match[2] ?? 'true';
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/suggest-ingredients-rei-do-suco.js --slug=rei-do-suco [--min=2] [--only=a,b] [--apply]');
    process.exit(1);
  }
  const apply = args.apply === 'true';
  const min = args.min ? Number(args.min) : 2;
  if (!Number.isInteger(min) || min < 1) {
    console.error('--min precisa ser um número inteiro maior que zero.');
    process.exit(1);
  }
  const only = args.only ? args.only.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const products = await prisma.product.findMany({
    where: { restaurantId: rid },
    select: {
      id: true,
      name: true,
      description: true,
      isCustom: true,
      ingredients: { select: { id: true } },
      optionalIngredients: { select: { id: true } },
    },
  });
  const existing = await prisma.ingredient.findMany({ where: { restaurantId: rid } });
  const existingByKey = new Map(existing.map((i) => [normalizeText(i.name), i]));
  const linked = new Map(products.map((p) => [p.id, new Set([...p.ingredients, ...p.optionalIngredients].map((i) => i.id))]));

  const suggestions = suggestIngredientsFromMenu(products, { min, only });
  console.log(`${apply ? 'APLICANDO' : 'SIMULAÇÃO (nada será gravado)'} — "${restaurant.name}" (${slug}), mínimo ${min} produto(s).`);
  if (suggestions.length === 0) console.log('Nenhum insumo sugerido com esses filtros.');

  let created = 0;
  let links = 0;
  for (const s of suggestions) {
    const found = existingByKey.get(normalizeText(s.name));
    // Só conta vínculo novo: o que já estava ligado (em qualquer tipo) fica como está.
    const newEssential = s.essentialProductIds.filter((id) => !found || !linked.get(id)?.has(found.id));
    const newOptional = s.optionalProductIds.filter((id) => !found || !linked.get(id)?.has(found.id));
    console.log(
      `${found ? '=' : '+'} ${s.name}: ${newEssential.length} somem do cardápio, ${newOptional.length} dá pra tirar` +
        `${found ? ' (insumo já existe; só liga o que falta)' : ' (insumo novo)'}`,
    );
    if (!apply) continue;

    const row = found ?? (await prisma.ingredient.create({ data: { restaurantId: rid, name: s.name } }));
    if (!found) created++;
    if (newEssential.length || newOptional.length) {
      await prisma.ingredient.update({
        where: { id: row.id },
        data: {
          products: { connect: newEssential.map((id) => ({ id })) },
          optionalProducts: { connect: newOptional.map((id) => ({ id })) },
        },
      });
    }
    links += newEssential.length + newOptional.length;
  }

  if (apply) console.log(`Pronto: ${created} insumo(s) criado(s), ${links} vínculo(s) novo(s).`);
  else if (suggestions.length) console.log('Pra gravar, rode de novo com --apply (use --only=... pra escolher quais).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
