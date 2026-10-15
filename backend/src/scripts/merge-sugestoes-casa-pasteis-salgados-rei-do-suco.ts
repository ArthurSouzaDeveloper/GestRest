/**
 * Junta "Pastéis Salgados" + "Sugestões da Casa" numa categoria só, chamada
 * "Sugestão da Casa e Monte Seu Pastel" — pedido do cliente/dono. "Monte o Seu Pastel"
 * (isCustom) já aparece primeiro sozinho (ver catalog.service.ts#productService.list:
 * `orderBy: [{ isCustom: 'desc' }, { name: 'asc' }]`), não precisa de nada extra pra isso.
 *
 * Mantém a categoria "Pastéis Salgados" (renomeada) como sobrevivente — ela já carrega o
 * "Monte o Seu Pastel" e os adicionais BASE (sabor) usados pra precificar ele. Move pra
 * dentro dela todos os produtos de "Sugestões da Casa", e apaga essa última (fica vazia).
 *
 * Os dois cardápios compartilham os mesmos 30 adicionais de cobertura (ver
 * ADICIONAIS_SALGADOS em import-menu-rei-do-suco.ts — criados em dobro, um registro em
 * cada categoria, de propósito na época). Juntar as categorias duplicaria essas opções na
 * tela de escolher adicional. Em vez de apagar a duplicata (que pode já ter sido usada em
 * algum pedido — e aí o banco bloqueia a exclusão, igual productService/additionalService
 * já fazem), ela só é desativada (`active: false`) depois de movida: some da lista de
 * escolha pro cliente, mas o histórico de pedidos antigos que já a usaram continua válido.
 *
 * Idempotente: se a categoria "Sugestão da Casa e Monte Seu Pastel" já existir (rodou
 * antes), ou "Sugestões da Casa" já não existir, sai sem fazer nada. Seguro rodar de novo.
 *
 * Uso:
 *   node dist/scripts/merge-sugestoes-casa-pasteis-salgados-rei-do-suco.js --slug=rei-do-suco
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_NAME = 'Sugestão da Casa e Monte Seu Pastel';
const NEW_SORT_ORDER = 1;

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
    console.error('Uso: node dist/scripts/merge-sugestoes-casa-pasteis-salgados-rei-do-suco.js --slug=rei-do-suco');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`Nenhum restaurante encontrado com o slug "${slug}".`);
    process.exit(1);
  }
  const rid = restaurant.id;

  const alreadyMerged = await prisma.category.findFirst({ where: { restaurantId: rid, name: NEW_NAME } });
  if (alreadyMerged) {
    console.log(`Categoria "${NEW_NAME}" já existe — nada a fazer (script já rodou antes).`);
    return;
  }

  const pasteisSalgados = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Pastéis Salgados' } });
  if (!pasteisSalgados) {
    console.error('Categoria "Pastéis Salgados" não encontrada.');
    process.exit(1);
  }

  const sugestoesCasa = await prisma.category.findFirst({ where: { restaurantId: rid, name: 'Sugestões da Casa' } });
  if (!sugestoesCasa) {
    console.log('Categoria "Sugestões da Casa" já não existe — nada a fazer (script já rodou antes).');
    return;
  }

  const destId = pasteisSalgados.id;

  // Produtos: sem risco de nome repetido entre as duas categorias, só move.
  const products = await prisma.product.findMany({ where: { restaurantId: rid, categoryId: sugestoesCasa.id } });
  for (const p of products) {
    await prisma.product.update({ where: { id: p.id }, data: { categoryId: destId } });
  }
  console.log(`${products.length} produto(s) movido(s) de "Sugestões da Casa" para "Pastéis Salgados".`);

  // Adicionais: move todos; o que for duplicata (mesmo nome+kind já na categoria destino)
  // fica desativado em vez de apagado, pra não arriscar pedido antigo que já usou.
  const destAdditionalsBefore = await prisma.additional.findMany({ where: { restaurantId: rid, categoryId: destId } });
  const existingKeys = new Set(destAdditionalsBefore.map((a) => `${a.name.toLowerCase()}::${a.kind}`));

  const sourceAdditionals = await prisma.additional.findMany({ where: { restaurantId: rid, categoryId: sugestoesCasa.id } });
  let moved = 0;
  let deactivated = 0;
  for (const a of sourceAdditionals) {
    const key = `${a.name.toLowerCase()}::${a.kind}`;
    const isDuplicate = existingKeys.has(key);
    await prisma.additional.update({
      where: { id: a.id },
      data: { categoryId: destId, ...(isDuplicate ? { active: false } : {}) },
    });
    if (isDuplicate) deactivated++;
    else moved++;
  }
  console.log(`${sourceAdditionals.length} adicional(is) movido(s) de "Sugestões da Casa" (${moved} novo(s), ${deactivated} duplicata(s) desativada(s)).`);

  await prisma.category.update({ where: { id: destId }, data: { name: NEW_NAME, sortOrder: NEW_SORT_ORDER } });
  console.log(`Categoria "Pastéis Salgados" renomeada para "${NEW_NAME}".`);

  await prisma.category.delete({ where: { id: sugestoesCasa.id } });
  console.log('Categoria "Sugestões da Casa" removida (vazia).');
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
