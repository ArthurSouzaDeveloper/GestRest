/**
 * Importa o cardápio completo de "O Rei do Suco" para um restaurante já
 * cadastrado na plataforma (crie o restaurante e o admin antes, pelo painel
 * /super — este script só popula categorias, produtos e adicionais).
 *
 * Idempotente: rodar de novo não duplica (categorias por nome, produtos e
 * adicionais checados por nome antes de criar).
 *
 * Uso:
 *   node dist/scripts/import-menu-rei-do-suco.js --slug=rei-do-suco
 */
import { AdditionalKind, PrismaClient, Station } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const match = raw.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// DADOS DO CARDÁPIO (transcrito e conferido do cardápio físico)
// ─────────────────────────────────────────────────────────────

const CATEGORIES: { key: string; name: string; station: Station; sortOrder: number }[] = [
  { key: 'porcoes', name: 'Porções', station: Station.KITCHEN, sortOrder: 1 },
  { key: 'pasteis_salgados', name: 'Pastéis Salgados', station: Station.KITCHEN, sortOrder: 2 },
  { key: 'sugestoes_casa', name: 'Sugestões da Casa', station: Station.KITCHEN, sortOrder: 3 },
  { key: 'pasteis_doces', name: 'Pastéis Doces', station: Station.KITCHEN, sortOrder: 4 },
  { key: 'mini_pizza_salgada', name: 'Mini Pizza Salgada', station: Station.KITCHEN, sortOrder: 5 },
  { key: 'mini_pizza_doce', name: 'Mini Pizza Doce', station: Station.KITCHEN, sortOrder: 6 },
  { key: 'sucos', name: 'Sucos', station: Station.JUICE_BAR, sortOrder: 7 },
  { key: 'acai_cupuacu', name: 'Açaí e Cupuaçu', station: Station.JUICE_BAR, sortOrder: 8 },
  { key: 'bebidas', name: 'Bebidas', station: Station.JUICE_BAR, sortOrder: 9 },
];

const PORCOES: [string, number, number][] = [
  ['Batata Frita', 20.0, 15],
  ['Dadinho de Tapioca com Geleia de Pimenta', 25.0, 15],
  ['Mini Pastéis / Sabores Misto (queijo, presunto e queijo e calabresa)', 23.0, 12],
];

const PASTEIS_SALGADOS: [string, number][] = [
  ['Salmão', 29.0],
  ['Linguiça', 13.5],
  ['Atum', 16.0],
  ['Pepperoni', 15.0],
  ['Brócolis', 13.5],
  ['Costela', 16.5],
  ['Calabresa', 14.5],
  ['Carne', 14.5],
  ['Carne Seca', 16.5],
  ['Camarão', 19.0],
  ['Frango', 14.5],
  ['Lombo', 14.5],
  ['Picanha', 18.5],
  ['Palmito', 14.5],
  ['Peito de Peru', 14.5],
  ['Pernil', 14.5],
  ['Pizza', 14.5],
  ['Presunto', 13.5],
  ['Mussarela', 14.5],
  ['Salame', 14.5],
  ['Salsicha', 13.5],
  ['Escarola', 13.0],
];

const SUGESTOES_CASA: [string, string, number][] = [
  ['Pastemaki', '140g salmão, cream cheese, cebolinha, molho tarê e gergelim', 39.0],
  ['Marguerita', 'mussarela, tomate, orégano e manjericão', 16.5],
  ['Caipira', 'frango, creme de milho, queijo, catupiry, milho, ervilha e ovo', 19.0],
  ['Churrasco do Rei', 'picanha, mussarela, molho de alho e vinagrete', 25.0],
  ['Parmegiana do Rei', 'frango empanado, presunto, queijo, molho de tomate e catupiry - tamanho até 25cm', 23.0],
  ['Medalhão de Frango', 'medalhão de frango enrolado no bacon com queijo duplo', 19.0],
  ['Churrasco do Rei 2', 'linguiça nobre, rúcula, molho de alho, queijo e vinagrete', 18.0],
  ['Escarola da Casa', 'escarola, mussarela, alho frito e bacon', 16.0],
  ['Atum do Rei', 'atum em pedaços, mussarela e cebola', 18.0],
  ['Nobre', 'linguiça nobre, mussarela e molho de alho', 17.0],
  ['Clássico', 'peito de peru, alho poró, mussarela e cream cheese', 18.0],
  ['Catupperoni', 'pepperoni, mussarela e catupiry', 17.5],
  ['À Moda da Casa', 'carne, mussarela, milho, ervilha, tomate e ovo', 20.0],
  ['Costela do Rei', 'carne de costela, queijo branco e cebola defumada', 22.0],
  ['Cocoricó', 'frango, ervilha, milho, ovo e catupiry', 18.0],
  ['Especial Vegetariano', 'mussarela, brócolis, tomate, milho, ervilha, azeitona e cebola', 20.0],
  ['Estrogonofe de Frango', 'frango em cubos, mussarela, batata palha e champignon', 18.0],
  ['Especial do Chefe', 'peito de peru, mussarela, catupiry, cebola, orégano, alho frito, mostarda e azeitona preta', 21.0],
  ['Especial da Casa', 'carne, cheddar, tomate, presunto, mussarela, milho, ovo, bacon e parmesão — servido no prato com talheres', 25.0],
  ['Escondidinho', 'carne seca, purê de batata, mussarela e molho de tomate', 21.0],
  ['Frango Especial', 'frango desfiado, cebola, molho barbecue, parmesão e mussarela', 17.5],
  ['Hot Dog', 'salsicha, mussarela, milho, ervilha e batata palha', 17.5],
  ['Nacho com Queijo', 'doritos, mussarela e catupiry', 17.0],
  ['Pastel X Burguer', 'hambúrguer, ovo frito, presunto, mussarela, bacon, tomate e catupiry', 27.0],
  ['2 Queijos', 'mussarela, catupiry e azeitona', 18.0],
  ['3 Queijos', 'mussarela, parmesão e catupiry', 19.5],
  ['4 Queijos', 'mussarela, parmesão, provolone e catupiry', 23.0],
  ['5 Queijos', 'mussarela, parmesão, provolone, gorgonzola e catupiry', 26.0],
  ['X-Tudo', 'frango, carne, pizza, calabresa, palmito e catupiry', 25.0],
  ['Xadrez', 'frango, cebola, tomate, pimentão, mussarela e shoyu', 17.0],
];

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
  ['Bis Branco ou Preto', null, 16.0],
  ['Bombom Ouro Branco ou Sonho de Valsa', null, 16.0],
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

const MINI_PIZZA_SALGADA: [string, number][] = [
  ['Peito de Peru, Alho Poró, Mussarela e Cream Cheese', 16.5],
  ['Pepperoni, Mussarela e Catupiry', 16.0],
  ['Atum em Pedaços, Cebola, Orégano e Mussarela', 16.0],
  ['Calabresa, Cebola, Mussarela e Tomate', 16.0],
  ['Frango, Catupiry e Mussarela', 16.0],
  ['Frango, Mussarela, Milho e Ervilha', 16.0],
  ['Palmito com Mussarela', 16.0],
  ['Peito de Peru, Catupiry, Tomate e Mussarela', 16.0],
  ['Presunto, Mussarela, Tomate, Ovo e Orégano', 16.0],
  ['Quatro Queijos', 16.0],
  ['Mussarela, Bacon e Tomate', 16.0],
  ['Salame com Mussarela', 16.0],
];

const MINI_PIZZA_DOCE: [string, number][] = [
  ['Chocolate Preto com Paçoca', 14.5],
  ['Chocolate Branco com Negresco', 14.5],
  ['Ferrero Rocher com Nutella', 23.0],
  ['Brigadeiro', 14.5],
  ['Chocolate Preto com Confete', 14.5],
  ['Prestígio', 14.5],
  ['Sensação', 15.5],
  ['Banoffe (banana, doce de leite, canela e chantilly)', 16.0],
];

// Adicionais que podem ser colocados em qualquer pastel/pizza salgada (categorias: pasteis_salgados e sugestoes_casa)
const ADICIONAIS_SALGADOS: [string, number][] = [
  ['Guacamole Apimentada 200ml', 8.0],
  ['Purê de Batata', 3.0],
  ['Molho de Alho', 2.0],
  ['Cream Cheese', 4.5],
  ['Cebola Caramelizada', 2.5],
  ['Cebola Defumada', 2.5],
  ['Alho Poró', 2.0],
  ['Pepperoni', 4.0],
  ['Alho Frito', 1.0],
  ['Azeitona Preta', 3.0],
  ['Azeitona Verde', 2.5],
  ['Bacon', 3.0],
  ['Batata Palha', 1.0],
  ['Catupiry', 3.5],
  ['Cebola', 1.0],
  ['Champignon', 3.5],
  ['Cheddar', 3.5],
  ['Ervilha', 1.0],
  ['Gorgonzola', 3.5],
  ['Milho', 1.0],
  ['Mussarela', 3.5],
  ['Orégano', 0.8],
  ['Ovo Cozido', 2.5],
  ['Parmesão', 3.5],
  ['Pimentão', 2.0],
  ['Provolone', 3.5],
  ['Pimenta Biquinho', 2.0],
  ['Tomate', 2.0],
  ['Tomate Seco', 3.0],
  ['Queijo Branco', 4.5],
  ['Vinagrete 200ml', 4.0],
];

// Frutas x Bases (Sucos 500ml) — preço exato de cada célula da tabela do cardápio.
// null = combinação não vendida (ex.: Salada de Frutas não tem opção Água).
const BASES = ['Água', 'Laranja', 'Leite', 'Frapê', 'Vinho'] as const;
const SUCOS_MATRIZ: [string, (number | null)[]][] = [
  ['Detox', [14.0, 15.0, 15.0, 18.0, 20.0]],
  ['Salada de Frutas (mamão, morango, abacaxi, banana e laranja)', [null, 17.5, 18.5, 22.0, 23.0]],
  ['Salada Mista (morango, mamão, banana, beterraba e abacaxi)', [15.5, 17.5, 18.0, 22.0, 24.0]],
  ['Abacaxi', [12.5, 14.0, 14.0, 17.5, 19.5]],
  ['Abacaxi com Hortelã', [12.5, 14.5, 14.5, 17.5, 19.5]],
  ['Açaí', [15.5, 17.5, 17.5, 20.5, 22.5]],
  ['Acerola', [12.5, 13.5, 13.5, 17.0, 22.5]],
  ['Amora', [16.5, 18.5, 18.5, 23.0, 24.5]],
  ['Banana', [12.5, 13.5, 13.5, 16.5, 18.5]],
  ['Cajá', [13.5, 14.5, 14.5, 17.0, 18.0]],
  ['Caju', [13.0, 14.0, 14.0, 15.5, 18.0]],
  ['Coco', [13.5, 14.5, 14.5, 17.0, 18.5]],
  ['Cupuaçu', [13.5, 14.5, 14.5, 18.0, 19.5]],
  ['Framboesa', [18.5, 20.5, 20.5, 22.5, 23.5]],
  ['Goiaba', [13.5, 14.5, 14.5, 16.5, 20.5]],
  ['Graviola', [13.5, 14.5, 14.5, 17.5, 19.5]],
  ['Limão', [12.0, 13.5, 13.5, 16.5, 18.0]],
  ['Mamão', [13.5, 15.0, 15.0, 17.5, 19.5]],
  ['Manga', [13.5, 14.5, 14.5, 17.0, 18.5]],
  ['Maracujá', [14.0, 15.5, 15.5, 19.5, 20.5]],
  ['Melancia', [13.5, 14.5, 14.5, 17.5, 19.5]],
  ['Melão', [13.5, 14.5, 14.5, 17.5, 18.5]],
  ['Morango', [14.5, 17.0, 17.0, 19.5, 22.5]],
  ['Pêssego', [13.5, 14.5, 14.5, 17.5, 18.0]],
  ['Tamarindo', [13.5, 14.5, 14.5, 17.5, 18.5]],
  ['Tangerina', [13.5, 14.5, 14.5, 17.5, 18.5]],
  ['Uva', [13.5, 14.5, 14.5, 17.5, 18.5]],
];

const FRAPES_NOVIDADE: [string, number][] = [
  ['Frapê Doce de Leite', 18.0],
  ['Frappuccino (frapê de cappuccino)', 18.0],
  ['Frapê de Ovomaltine', 18.0],
];

const ADICIONAIS_SUCOS: [string, number][] = [
  ['Bis (2 unidades) — Preto ou Branco', 3.0],
  ['Bombom (2 unidades) — Ouro Branco ou Sonho de Valsa', 4.0],
  ['Groselha', 2.0],
  ['Frutas (incluindo cenoura e beterraba)', 1.0],
  ['Paçoquita', 2.0],
];

const ACAI_CUPUACU: [string, number][] = [
  ['Açaí 500ml (Puro)', 19.0],
  ['Açaí 300ml (Puro)', 16.0],
  ['Cupuaçu 500ml (Puro)', 19.0],
  ['Cupuaçu 300ml (Puro)', 16.0],
  ['Casadinho (açaí e cupuaçu) 500ml', 19.5],
  ['Casadinho (açaí e cupuaçu) 300ml', 16.5],
];

const ADICIONAIS_ACAI: [string, number][] = [
  ['Banana', 2.5],
  ['Morango', 3.5],
  ['Granola', 2.5],
  ['Leite Condensado', 2.5],
  ['Leite em Pó', 3.0],
  ['Sucrilhos', 2.5],
  ['Confete', 3.5],
  ['Nutella', 7.0],
  ['Ovomaltine', 6.0],
  ['Sorvete (napolitano ou creme)', 4.0],
  ['Paçoca', 2.5],
  ['Bombom', 4.0],
  ['Bis', 3.5],
  ['Cobertura', 1.5],
  ['Mel', 3.5],
];

const BEBIDAS: [string, number][] = [
  ['Água Mineral 500ml', 3.0],
  ['Água com Gás 500ml', 4.0],
  ['Água Tônica Lata', 6.0],
  ['Fanta Laranja Lata', 6.0],
  ['Fanta Uva Lata', 6.0],
  ['Guaraná Lata', 6.0],
  ['Coca-Cola 290ml', 6.0],
  ['Coca-Cola Lata', 6.0],
  ['Coca-Cola Lata Zero', 6.0],
  ['Coca-Cola 600ml', 9.0],
  ['Coca-Cola 2L', 15.0],
  ['Coca-Cola 2L Zero', 16.0],
  ['Skol Lata', 6.0],
  ['Brahma Lata', 6.0],
  ['H2O (sabores)', 7.0],
  ['Heineken', 8.0],
];

// ─────────────────────────────────────────────────────────────

async function ensureCategory(
  restaurantId: string,
  name: string,
  station: Station,
  sortOrder: number,
) {
  const existing = await prisma.category.findFirst({ where: { restaurantId, name } });
  if (existing) return existing;
  return prisma.category.create({ data: { restaurantId, name, station, sortOrder } });
}

async function ensureProduct(
  restaurantId: string,
  categoryId: string,
  name: string,
  price: number,
  avgPrepMin: number,
  description?: string | null,
) {
  const existing = await prisma.product.findFirst({ where: { restaurantId, categoryId, name } });
  if (existing) return { created: false };
  await prisma.product.create({
    data: { restaurantId, categoryId, name, price, avgPrepMin, description: description ?? undefined },
  });
  return { created: true };
}

// A chave de idempotência inclui o kind de propósito: "Pepperoni" existe como sabor-base
// (R$15, o pastel inteiro) E como adicional de cobertura (R$4) na mesma categoria — são
// dois registros distintos e legítimos, não uma duplicata.
async function ensureAdditional(
  restaurantId: string,
  categoryId: string,
  name: string,
  price: number,
  kind: AdditionalKind = AdditionalKind.ADDON,
) {
  const existing = await prisma.additional.findFirst({ where: { restaurantId, categoryId, name, kind } });
  if (existing) return { created: false };
  await prisma.additional.create({ data: { restaurantId, categoryId, name, price, kind } });
  return { created: true };
}

/**
 * Garante o produto "montável" (Monte o Seu / Monte a Sua) da categoria: preço R$0 (o
 * valor vem inteiro do sabor-base escolhido) + isCustom. Se o produto já existia da
 * versão antiga do script (preço fixo + "peça na observação"), atualiza no lugar.
 */
async function ensureCustomProduct(
  restaurantId: string,
  categoryId: string,
  name: string,
  avgPrepMin: number,
  oldNames: string[] = [],
) {
  const description = 'Escolha o sabor-base e monte do seu jeito com os adicionais.';
  const existing = await prisma.product.findFirst({
    where: { restaurantId, categoryId, name: { in: [name, ...oldNames] } },
  });
  if (existing) {
    await prisma.product.update({
      where: { id: existing.id },
      data: { name, price: 0, isCustom: true, description },
    });
    return { created: false };
  }
  await prisma.product.create({
    data: { restaurantId, categoryId, name, price: 0, avgPrepMin, description, isCustom: true },
  });
  return { created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  if (!slug) {
    console.error('Uso: node dist/scripts/import-menu-rei-do-suco.js --slug=rei-do-suco');
    console.error('(O restaurante precisa já existir — crie pelo painel /super antes.)');
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    console.error(`❌ Nenhum restaurante encontrado com o slug "${slug}". Crie-o em /super primeiro.`);
    process.exit(1);
  }
  const rid = restaurant.id;
  console.log(`🍹 Importando cardápio de "O Rei do Suco" para "${restaurant.name}" (${slug})...`);

  const cat: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const created = await ensureCategory(rid, c.name, c.station, c.sortOrder);
    cat[c.key] = created.id;
  }

  let productsCreated = 0;
  let additionalsCreated = 0;

  // Porções
  for (const [name, price, prep] of PORCOES) {
    if ((await ensureProduct(rid, cat.porcoes, name, price, prep)).created) productsCreated++;
  }

  // Pastéis salgados + "monte o seu" (montável: base obrigatória com o preço do sabor)
  for (const [name, price] of PASTEIS_SALGADOS) {
    if ((await ensureProduct(rid, cat.pasteis_salgados, name, price, 12)).created) productsCreated++;
  }
  if (
    (
      await ensureCustomProduct(rid, cat.pasteis_salgados, 'Monte o Seu Pastel', 12, [
        'Monte o Seu (escolha os ingredientes)',
      ])
    ).created
  )
    productsCreated++;

  // Sugestões da casa
  for (const [name, desc, price] of SUGESTOES_CASA) {
    if ((await ensureProduct(rid, cat.sugestoes_casa, name, price, 15, desc)).created) productsCreated++;
  }

  // Pastéis doces + "monte o seu"
  for (const [name, desc, price] of PASTEIS_DOCES) {
    if ((await ensureProduct(rid, cat.pasteis_doces, name, price, 12, desc)).created) productsCreated++;
  }
  if (
    (
      await ensureCustomProduct(rid, cat.pasteis_doces, 'Monte o Seu Pastel Doce', 12, [
        'Monte o Seu (escolha os ingredientes)',
      ])
    ).created
  )
    productsCreated++;

  // Mini pizza salgada + "monte a sua"
  for (const [name, price] of MINI_PIZZA_SALGADA) {
    if ((await ensureProduct(rid, cat.mini_pizza_salgada, name, price, 15)).created) productsCreated++;
  }
  if (
    (
      await ensureCustomProduct(rid, cat.mini_pizza_salgada, 'Monte a Sua Mini Pizza', 15, [
        'Monte a Sua (escolha os ingredientes)',
      ])
    ).created
  )
    productsCreated++;

  // Mini pizza doce + "monte a sua"
  for (const [name, price] of MINI_PIZZA_DOCE) {
    if ((await ensureProduct(rid, cat.mini_pizza_doce, name, price, 15)).created) productsCreated++;
  }
  if (
    (
      await ensureCustomProduct(rid, cat.mini_pizza_doce, 'Monte a Sua Mini Pizza Doce', 15, [
        'Monte a Sua (escolha os ingredientes)',
      ])
    ).created
  )
    productsCreated++;

  // Sucos: matriz fruta × base — um produto por combinação, nomeado "Fruta (Base)"
  // para o Montador de Suco do garçom localizar e agrupar automaticamente.
  for (const [fruit, prices] of SUCOS_MATRIZ) {
    for (let i = 0; i < BASES.length; i++) {
      const price = prices[i];
      if (price === null) continue;
      const name = `${fruit} (${BASES[i]})`;
      if ((await ensureProduct(rid, cat.sucos, name, price, 5)).created) productsCreated++;
    }
  }
  // Frapês "novidade" (já têm base fixa, sem seleção)
  for (const [name, price] of FRAPES_NOVIDADE) {
    if ((await ensureProduct(rid, cat.sucos, name, price, 7)).created) productsCreated++;
  }

  // Açaí e Cupuaçu no copo
  for (const [name, price] of ACAI_CUPUACU) {
    if ((await ensureProduct(rid, cat.acai_cupuacu, name, price, 5)).created) productsCreated++;
  }

  // Bebidas prontas
  for (const [name, price] of BEBIDAS) {
    if ((await ensureProduct(rid, cat.bebidas, name, price, 1)).created) productsCreated++;
  }

  // Bases dos montáveis: replicam os sabores simples da categoria com o preço normal do
  // prato — no modal do "Monte o Seu", o cliente escolhe exatamente 1 base (que dá o
  // preço) e complementa com os adicionais comuns abaixo.
  for (const [name, price] of PASTEIS_SALGADOS) {
    if ((await ensureAdditional(rid, cat.pasteis_salgados, name, price, AdditionalKind.BASE)).created)
      additionalsCreated++;
  }
  for (const [name, , price] of PASTEIS_DOCES) {
    if ((await ensureAdditional(rid, cat.pasteis_doces, name, price, AdditionalKind.BASE)).created)
      additionalsCreated++;
  }
  for (const [name, price] of MINI_PIZZA_SALGADA) {
    if ((await ensureAdditional(rid, cat.mini_pizza_salgada, name, price, AdditionalKind.BASE)).created)
      additionalsCreated++;
  }
  for (const [name, price] of MINI_PIZZA_DOCE) {
    if ((await ensureAdditional(rid, cat.mini_pizza_doce, name, price, AdditionalKind.BASE)).created)
      additionalsCreated++;
  }

  // Adicionais: salgados aplicam-se a Pastéis Salgados E Sugestões da Casa
  for (const [name, price] of ADICIONAIS_SALGADOS) {
    if ((await ensureAdditional(rid, cat.pasteis_salgados, name, price)).created) additionalsCreated++;
    if ((await ensureAdditional(rid, cat.sugestoes_casa, name, price)).created) additionalsCreated++;
  }
  // Sorvete adicional (pastéis doces)
  if (
    (
      await ensureAdditional(rid, cat.pasteis_doces, 'Sorvete Adicional (2 bolas, creme ou napolitano)', 9.0)
    ).created
  )
    additionalsCreated++;
  // Dica do chefe (mini pizza doce)
  if (
    (
      await ensureAdditional(rid, cat.mini_pizza_doce, 'Dica do Chefe (bola de sorvete = Grand Gateau)', 6.0)
    ).created
  )
    additionalsCreated++;
  // Adicionais de sucos
  for (const [name, price] of ADICIONAIS_SUCOS) {
    if ((await ensureAdditional(rid, cat.sucos, name, price)).created) additionalsCreated++;
  }
  // Adicionais de açaí/cupuaçu
  for (const [name, price] of ADICIONAIS_ACAI) {
    if ((await ensureAdditional(rid, cat.acai_cupuacu, name, price)).created) additionalsCreated++;
  }

  console.log(`✅ Cardápio importado: ${productsCreated} produtos e ${additionalsCreated} adicionais criados.`);
  console.log(`   (itens já existentes foram ignorados — pode rodar de novo com segurança)`);
}

main()
  .catch((e) => {
    console.error('Erro:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
