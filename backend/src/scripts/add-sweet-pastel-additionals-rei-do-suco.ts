/**
 * Adiciona os ingredientes de cobertura pro "Monte o Seu Pastel Doce" que o cliente
 * mandou — hoje a categoria "Pastéis Doces" só tinha as bases (sabor-base do pastel,
 * ver import-menu-rei-do-suco.ts) e o "Sorvete Adicional"; nenhum dos 32 itens abaixo
 * existia ainda (ao contrário de "Pastéis Salgados", que já tem sua própria lista de
 * adicionais salgados).
 *
 * Também replica os mesmos 32 adicionais na categoria "Mini Pizza Doce" — pedido
 * explícito do cliente pra dar pra customizar a mini pizza doce já montada com os mesmos
 * ingredientes do pastel doce (mesma lógica já usada pro "Sorvete Adicional", que também
 * está nas duas categorias). O lado salgado já cobre isso: ADICIONAIS_SALGADOS em
 * import-menu-rei-do-suco.ts já aplica em Pastéis Salgados E Mini Pizza Salgada desde a
 * importação original do cardápio — nada a fazer nesse lado.
 *
 * Idempotente: cada adicional é identificado por (restaurantId, categoryId, name, kind) —
 * mesmo critério já usado em import-menu-rei-do-suco.ts#ensureAdditional. Rodar de novo
 * não duplica nada; só cria o que ainda não existe.
 *
 * Uso:
 *   node dist/scripts/add-sweet-pastel-additionals-rei-do-suco.js --slug=rei-do-suco
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

const ADICIONAIS_DOCES: [string, number][] = [
  ['Amendoim', 3.0],
  ['Banana', 2.5],
  ['Bis branco', 3.5],
  ['Bis chocolate ao leite', 3.5],
  ['Bombom Ouro Branco', 4.0],
  ['Bombom Sonho de Valsa', 4.0],
  ['Canela', 1.0],
  ['Cereja', 7.0],
  ['Chocolate ao leite', 6.0],
  ['Chocolate branco', 6.0],
  ['Coco', 2.0],
  ['Confetes', 4.0],
  ['Doce de leite', 6.0],
  ['Ferrero Rocher (3 un.)', 15.0],
  ['Flocos crocantes', 3.0],
  ['Goiabada', 4.0],
  ['Kit Kat barra', 6.0],
  ['Leite condensado', 2.5],
  ['Leite em pó', 3.0],
  ['Maçã', 2.5],
  ['Morango', 3.5],
  ['Mussarela', 3.5],
  ['Negresco', 3.0],
  ['Nozes', 8.0],
  ['Nutella', 7.0],
  ['Ovomaltine em pasta', 7.0],
  ['Paçoca', 3.0],
  ['Passar no açúcar e canela', 1.0],
  ['Pistache', 7.0],
  ['Queijo branco', 4.5],
  ['Queijo coalho (2 un.)', 12.0],
  ['Suflair barra', 9.0],
  ['Suspiro', 2.0],
];

const CATEGORY_NAMES = ['Pastéis Doces', 'Mini Pizza Doce'];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/add-sweet-pastel-additionals-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  let created = 0;
  let skipped = 0;
  for (const categoryName of CATEGORY_NAMES) {
    const category = await prisma.category.findFirst({ where: { restaurantId: rid, name: categoryName } });
    if (!category) {
      console.warn(`[aviso] Categoria "${categoryName}" não encontrada — pulei.`);
      continue;
    }
    for (const [name, price] of ADICIONAIS_DOCES) {
      const existing = await prisma.additional.findFirst({
        where: { restaurantId: rid, categoryId: category.id, name, kind: AdditionalKind.ADDON },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.additional.create({
        data: { restaurantId: rid, categoryId: category.id, name, price, kind: AdditionalKind.ADDON },
      });
      created++;
    }
  }

  console.log(`${created} adicional(is) criado(s), ${skipped} já existia(m) — nada duplicado.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
