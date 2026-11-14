/**
 * Cadastra os sabores principais de pastel TAMBÉM como adicionais de cobertura — pedido do
 * cliente/dono: quem pede um pastel de Frango pode acrescentar Calabresa, Costela etc. por
 * cima, com preço de adicional (bem menor que o pastel inteiro do mesmo sabor).
 *
 * Mesmo modelo do add-barbecue-additional-rei-do-suco.ts: entra em toda categoria que já
 * tem o "Molho de Alho" como adicional ativo (hoje "Sugestão da Casa e Monte Seu Pastel" e
 * "Mini Pizza Salgada", ver ADICIONAIS_SALGADOS em import-menu-rei-do-suco.ts), sempre
 * como kind ADDON.
 *
 * Nome igual ao do sabor-base de propósito: "Frango" existe como adicional BASE (o pastel
 * inteiro, R$14,50) E como ADDON (a cobertura, R$4,50) na mesma categoria — dois registros
 * legítimos, exatamente como o "Pepperoni" já era desde o import original (ver o comentário
 * de ensureAdditional em import-menu-rei-do-suco.ts). Na impressão, BASE vira o título
 * grande do item e ADDON sai embaixo com "+" (ver printJob.service.ts#toTicketItem), então
 * a cozinha continua distinguindo o sabor do pastel das coberturas.
 *
 * Idempotente: identifica cada adicional por (restaurantId, categoryId, name, kind=ADDON).
 * Rodar de novo não duplica; se já existir, só reativa. O preço de um adicional que já
 * existia NÃO é alterado por padrão (o "Pepperoni" já estava a R$4,00 e a lista nova pede
 * R$6,00) — passe --atualizar-precos pra acertar os preços também.
 *
 * Uso:
 *   node dist/scripts/add-sabores-additionals-rei-do-suco.js --slug=rei-do-suco --dry-run
 *   node dist/scripts/add-sabores-additionals-rei-do-suco.js --slug=rei-do-suco
 *   node dist/scripts/add-sabores-additionals-rei-do-suco.js --slug=rei-do-suco --atualizar-precos
 *   node dist/scripts/add-sabores-additionals-rei-do-suco.js --slug=rei-do-suco --so-pasteis
 *
 * --so-pasteis deixa a Mini Pizza Salgada de fora (só a categoria dos pastéis recebe).
 */
import { AdditionalKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categoria de referência: as que têm esse adicional ativo recebem os sabores.
const REFERENCE = 'Molho de Alho';

// Com --so-pasteis, só esta categoria recebe (a Mini Pizza Salgada fica de fora).
const PASTEL_CATEGORY = 'Sugestão da Casa e Monte Seu Pastel';

// Sabores x preço de cobertura, como o dono passou. Os nomes seguem a grafia que o
// cardápio já usa nos sabores-base ("Carne Seca", "Peito de Peru"), pra não aparecerem
// duas escritas do mesmo sabor no painel e na impressão.
const SABORES: [string, number][] = [
  ['Linguiça', 4.5],
  ['Atum', 8.0],
  ['Pepperoni', 6.0],
  ['Brócolis', 4.5],
  ['Costela', 8.0],
  ['Calabresa', 4.5],
  ['Carne', 4.5],
  ['Carne Seca', 8.0],
  ['Frango', 4.5],
  ['Lombo', 4.5],
  ['Palmito', 4.5],
  ['Peito de Peru', 4.5],
  ['Pernil', 4.5],
  ['Pizza', 4.5],
  ['Presunto', 4.5],
  ['Salame', 8.0],
  ['Salsicha', 3.5],
  ['Escarola', 3.5],
  ['Doritos', 4.5],
  ['Camarão', 9.0],
  ['Picanha', 9.0],
];

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z-]+)(?:=(.*))?$/);
    if (match) out[match[1].toLowerCase()] = match[2] ?? 'true';
  }
  return out;
}

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  const dryRun = args['dry-run'] === 'true';
  const updatePrices = args['atualizar-precos'] === 'true';
  const onlyPasteis = args['so-pasteis'] === 'true';
  if (!slug) {
    console.error(
      'Uso: node dist/scripts/add-sabores-additionals-rei-do-suco.js --slug=rei-do-suco [--dry-run] [--atualizar-precos] [--so-pasteis]',
    );
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const refs = await prisma.additional.findMany({
    where: {
      restaurantId: rid,
      name: REFERENCE,
      kind: AdditionalKind.ADDON,
      active: true,
      categoryId: { not: null },
      ...(onlyPasteis ? { category: { name: PASTEL_CATEGORY } } : {}),
    },
    include: { category: { select: { name: true } } },
  });
  if (refs.length === 0) {
    console.error(`Nenhuma categoria com o adicional "${REFERENCE}" — nada feito.`);
    process.exit(1);
  }

  if (dryRun) console.log('*** SIMULAÇÃO (--dry-run): nada é gravado no banco. ***');
  console.log(
    `Categorias que vão receber os sabores como adicional: ${refs
      .map((r) => `"${r.category?.name ?? r.categoryId}"`)
      .join(', ')}`,
  );

  let created = 0;
  let reactivated = 0;
  let repriced = 0;
  let untouched = 0;

  for (const ref of refs) {
    const categoryName = ref.category?.name ?? ref.categoryId;
    for (const [name, price] of SABORES) {
      const existing = await prisma.additional.findFirst({
        where: { restaurantId: rid, categoryId: ref.categoryId, name, kind: AdditionalKind.ADDON },
      });

      if (!existing) {
        if (!dryRun) {
          await prisma.additional.create({
            data: { restaurantId: rid, categoryId: ref.categoryId, name, price, kind: AdditionalKind.ADDON },
          });
        }
        console.log(`+ ${name} — ${brl(price)} (${categoryName})`);
        created++;
        continue;
      }

      const currentPrice = Number(existing.price);
      const data: { active?: boolean; price?: number } = {};
      const notes: string[] = [];

      if (!existing.active) {
        data.active = true;
        notes.push('reativado');
        reactivated++;
      }
      if (currentPrice !== price) {
        if (updatePrices) {
          data.price = price;
          notes.push(`preço ${brl(currentPrice)} -> ${brl(price)}`);
          repriced++;
        } else {
          notes.push(`preço mantido em ${brl(currentPrice)} (a lista pede ${brl(price)}; use --atualizar-precos)`);
        }
      }

      if (Object.keys(data).length > 0) {
        if (!dryRun) await prisma.additional.update({ where: { id: existing.id }, data });
      } else if (notes.length === 0) {
        untouched++;
        continue;
      }
      console.log(`= ${name} já existia em ${categoryName}: ${notes.join('; ')}.`);
    }
  }

  console.log(
    `\nResumo: ${created} criados, ${reactivated} reativados, ${repriced} com preço acertado, ${untouched} já estavam certos.`,
  );
  if (dryRun) console.log('Nada foi gravado — rode de novo sem --dry-run pra aplicar.');
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
