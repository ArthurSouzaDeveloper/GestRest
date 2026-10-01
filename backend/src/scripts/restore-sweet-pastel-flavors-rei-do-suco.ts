/**
 * Restaura os sabores prontos de "Pastéis Doces" pro estado canônico do cardápio original
 * (import-menu-rei-do-suco.ts#PASTEIS_DOCES) — o cliente confirmou que, mesmo depois de
 * rodar reactivate-premade-sweet-pastel-rei-do-suco.ts (que só reativa produtos já
 * existentes marcados available:false), a aba continuava só com os 4 sabores criados por
 * split-sweet-pastel-base-flavors-rei-do-suco.ts. Esse resultado ("0 reativados") só é
 * possível se os sabores não estiverem mais marcados available:false no banco — ou já
 * estão available:true (e o problema é outro, fora do alcance de um script) ou os
 * registros não existem mais na categoria.
 *
 * Pra cobrir os dois casos sem precisar diagnosticar qual é, este script GARANTE que cada
 * sabor da lista original exista e esteja disponível, de uma vez: se o produto existir
 * (ativo ou não), corrige nome/preço/descrição/available; se não existir, cria do zero.
 * Mesmo tratamento pro adicional BASE espelhado (usado como sabor-base no "Monte o Seu
 * Pastel Doce"). Idempotente — rodar de novo não duplica nada.
 *
 * EXCLUI de propósito os 2 sabores que foram divididos em opções individuais
 * (split-sweet-pastel-base-flavors-rei-do-suco.ts): "Bis Branco ou Preto" e "Bombom Ouro
 * Branco ou Sonho de Valsa" continuam fora da lista — os 4 substitutos (Bis Branco, Bis
 * Preto, Bombom Ouro Branco, Bombom Sonho de Valsa) são o estado correto hoje, não os 2
 * nomes combinados antigos.
 *
 * Uso:
 *   node dist/scripts/restore-sweet-pastel-flavors-rei-do-suco.js --slug=rei-do-suco
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

// Mesma lista de import-menu-rei-do-suco.ts#PASTEIS_DOCES, SEM os 2 nomes combinados
// ("Bis Branco ou Preto", "Bombom Ouro Branco ou Sonho de Valsa") — já substituídos pelos
// 4 sabores individuais pelo script de separação.
const PASTEIS_DOCES: [string, string | null, number][] = [
  ['Pistache', null, 20.0],
  ['Maçã com Banana, Leite Condensado e Canela', null, 15.5],
  ['Doce de Leite com Nozes', null, 18.0],
  ['Especial de Banana com Açaí', 'banana, granola, leite em pó, leite condensado e 3 bolas de açaí em cima do pastel', 20.0],
  ['Meio Amargo', null, 17.0],
  ['Cappuccino', 'chocolate ao leite com cappuccino', 16.0],
  ['Galak com Morango', null, 19.0],
  ['Ovomaltine com Ninho', null, 17.5],
  ['Trento Maracujá', 'com chocolate branco', 15.5],
  ['Trento Torta de Limão', 'com chocolate branco', 15.5],
  ['Banana, Canela e Leite Condensado', null, 15.0],
  ['Banana, Queijo e Canela', null, 15.0],
  ['Banana, Queijo e Goiabada', null, 16.0],
  ['Mineirinho', 'queijo branco fresco selado ao fogo com goiabada', 18.0],
  ['Brigadeiro', null, 15.0],
  ['Caribe', 'chocolate preto, banana e canela', 15.5],
  ['Charge', 'chocolate preto, doce de leite e amendoim', 16.0],
  ['Choco Ninho', 'chocolate preto com leite em pó', 16.0],
  ['Chocoim', 'paçoca, chocolate preto e branco', 16.0],
  ['Chocolate Branco, Leite em Pó e Morango', null, 19.0],
  ['Chocolate Preto com Paçoca', null, 15.5],
  ['Chocolate Preto com Confetes de Chocolate', null, 15.5],
  ['Chocomisto', 'chocolate branco, chocolate preto', 15.5],
  ['Choquito', 'chocolate preto, flocos crocantes', 15.5],
  ['Doce de Leite com Coco', null, 15.5],
  ['Doce de Leite com Queijo', null, 16.0],
  ['Ferrero Rocher', null, 25.0],
  ['Floresta Negra', 'chocolate preto com cereja', 18.0],
  ['Kit Kat', null, 16.0],
  ['Merengue', 'morango, leite condensado e suspiro', 15.0],
  ['Negresco', null, 16.0],
  ['Nutella', null, 19.0],
  ['Nutella com Ninho', null, 19.0],
  ['Prestígio', null, 16.5],
  ['Romeu e Julieta', 'mussarela e goiabada', 16.0],
  ['Sensação', null, 17.5],
  ['Suflair com Doce de Leite', null, 17.5],
  ['Suflair', null, 17.0],
  ['Talento', 'sabores: Avelã ou Castanha do Pará', 19.0],
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/restore-sweet-pastel-flavors-rei-do-suco.js --slug=rei-do-suco');
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

  let productsCreated = 0;
  let productsFixed = 0;
  let basesCreated = 0;
  let basesFixed = 0;

  for (const [name, description, price] of PASTEIS_DOCES) {
    const product = await prisma.product.findFirst({ where: { restaurantId: rid, categoryId, name, isCustom: false } });
    if (!product) {
      await prisma.product.create({
        data: { restaurantId: rid, categoryId, name, price, avgPrepMin: 12, description: description ?? undefined, available: true },
      });
      productsCreated++;
    } else if (!product.available || Number(product.price) !== price || product.description !== description) {
      await prisma.product.update({
        where: { id: product.id },
        data: { available: true, price, description: description ?? undefined },
      });
      productsFixed++;
    }

    const base = await prisma.additional.findFirst({
      where: { restaurantId: rid, categoryId, name, kind: AdditionalKind.BASE },
    });
    if (!base) {
      await prisma.additional.create({
        data: { restaurantId: rid, categoryId, name, price, kind: AdditionalKind.BASE, active: true },
      });
      basesCreated++;
    } else if (!base.active || Number(base.price) !== price) {
      await prisma.additional.update({ where: { id: base.id }, data: { active: true, price } });
      basesFixed++;
    }
  }

  console.log(
    `Produtos: ${productsCreated} criado(s), ${productsFixed} corrigido(s) (preço/descrição/disponibilidade). ` +
      `Bases: ${basesCreated} criada(s), ${basesFixed} corrigida(s).`,
  );
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
