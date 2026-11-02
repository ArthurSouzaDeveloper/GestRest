import { AdditionalKind, Prisma, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../utils/errors';

// Prisma's Decimal serializes to a string over JSON. Left unconverted, arithmetic like
// `product.price + additionalsTotal` on the client silently does string concatenation
// instead of addition (e.g. "16" + 0 => "160").
function serializeProduct<T extends { price: Prisma.Decimal | number }>(p: T) {
  return withSoldOutIngredients({ ...p, price: Number(p.price) });
}
function serializeAdditional<T extends { price: Prisma.Decimal | number }>(a: T) {
  return withSoldOutIngredients({ ...a, price: Number(a.price) });
}

// Insumos em falta (ex.: Laranja acabou) tornam o produto/adicional indisponível sem
// mexer no `available`/`active` próprio dele — assim, quando o insumo volta, só volta o
// que não estava esgotado por conta própria. A lista só traz os insumos EM FALTA (ver
// SOLD_OUT_INGREDIENTS) e vira `soldOutIngredients: string[]` pra tela mostrar o motivo.
export const SOLD_OUT_INGREDIENTS = {
  where: { inStock: false },
  select: { name: true },
  orderBy: { name: 'asc' },
} satisfies Prisma.Product$ingredientsArgs;
/** Filtro Prisma: nenhum insumo ligado está em falta. */
export const ALL_INGREDIENTS_IN_STOCK = { none: { inStock: false } } satisfies Prisma.IngredientListRelationFilter;

function withSoldOutIngredients<T extends object>(item: T) {
  const { ingredients, ...rest } = item as T & { ingredients?: { name: string }[] };
  return { ...rest, soldOutIngredients: (ingredients ?? []).map((i) => i.name) };
}
function serializeDeliveryZone<T extends { fee: Prisma.Decimal | number }>(z: T) {
  return { ...z, fee: Number(z.fee) };
}

export const categoryService = {
  list(tenantId: string) {
    return prisma.category.findMany({
      where: { restaurantId: tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  },
  create(tenantId: string, data: { name: string; station: Station; sortOrder?: number }) {
    return prisma.category.create({ data: { ...data, restaurantId: tenantId } });
  },
  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; station: Station; sortOrder: number }>,
  ) {
    await categoryService.ensure(tenantId, id);
    return prisma.category.update({ where: { id }, data });
  },
  async remove(tenantId: string, id: string) {
    await categoryService.ensure(tenantId, id);
    // Categoria com produtos/adicionais ainda vinculados não pode ser apagada — evita a
    // cascata que sumia com itens de pedidos já pagos (banco recusa com Restrict, mas
    // checar antes dá uma mensagem clara em vez do erro cru de constraint).
    const [productCount, additionalCount] = await Promise.all([
      prisma.product.count({ where: { categoryId: id } }),
      prisma.additional.count({ where: { categoryId: id } }),
    ]);
    if (productCount > 0 || additionalCount > 0) {
      throw new ConflictError(
        'Esta categoria ainda tem produtos ou adicionais cadastrados. Remova ou mova-os antes de apagar a categoria.',
      );
    }
    return prisma.category.delete({ where: { id } });
  },
  async ensure(tenantId: string, id: string) {
    const c = await prisma.category.findFirst({ where: { id, restaurantId: tenantId } });
    if (!c) throw new NotFoundError('Categoria');
    return c;
  },
};

export const productService = {
  async list(
    tenantId: string,
    params: { search?: string; categoryId?: string; onlyAvailable?: boolean } = {},
  ) {
    const where: Prisma.ProductWhereInput = { restaurantId: tenantId };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyAvailable) {
      where.available = true;
      where.ingredients = ALL_INGREDIENTS_IN_STOCK;
    }
    const products = await prisma.product.findMany({
      where,
      include: { category: true, ingredients: SOLD_OUT_INGREDIENTS },
      // Montáveis ("Monte o Seu") primeiro na categoria, resto alfabético.
      orderBy: [{ isCustom: 'desc' }, { name: 'asc' }],
    });
    return products.map(serializeProduct);
  },
  async get(tenantId: string, id: string) {
    const p = await prisma.product.findFirst({
      where: { id, restaurantId: tenantId },
      include: { category: true, ingredients: SOLD_OUT_INGREDIENTS },
    });
    if (!p) throw new NotFoundError('Produto');
    return serializeProduct(p);
  },
  async create(
    tenantId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      categoryId: string;
      avgPrepMin?: number;
      imageUrl?: string;
      available?: boolean;
      isCustom?: boolean;
    },
  ) {
    // Garante que a categoria pertence ao mesmo restaurante.
    await categoryService.ensure(tenantId, data.categoryId);
    const p = await prisma.product.create({ data: { ...data, restaurantId: tenantId } });
    return serializeProduct(p);
  },
  async update(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      categoryId: string;
      avgPrepMin: number;
      imageUrl: string;
      available: boolean;
      isCustom: boolean;
    }>,
  ) {
    await productService.get(tenantId, id);
    // Reassigning to a category must stay inside the same tenant, same as on create.
    if (data.categoryId) await categoryService.ensure(tenantId, data.categoryId);
    const p = await prisma.product.update({ where: { id }, data });
    return serializeProduct(p);
  },
  async remove(tenantId: string, id: string) {
    await productService.get(tenantId, id);
    // Produto já usado em algum pedido não pode ser apagado — isso levaria o item do
    // pedido (mesmo de venda já paga) junto. Quem quer tirar do cardápio sem perder
    // histórico deve usar `available: false` em vez de excluir.
    const orderItemCount = await prisma.orderItem.count({ where: { productId: id } });
    if (orderItemCount > 0) {
      throw new ConflictError(
        'Este produto já foi usado em pedidos e não pode ser removido. Marque-o como indisponível em vez de excluir.',
      );
    }
    return prisma.product.delete({ where: { id } });
  },
};

export const additionalService = {
  async list(tenantId: string, params: { categoryId?: string; onlyActive?: boolean } = {}) {
    const where: Prisma.AdditionalWhereInput = { restaurantId: tenantId };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyActive) {
      where.active = true;
      where.ingredients = ALL_INGREDIENTS_IN_STOCK;
    }
    const additionals = await prisma.additional.findMany({
      where,
      include: { ingredients: SOLD_OUT_INGREDIENTS },
      orderBy: { name: 'asc' },
    });
    return additionals.map(serializeAdditional);
  },
  async create(
    tenantId: string,
    data: { name: string; price: number; categoryId?: string; active?: boolean; kind?: AdditionalKind },
  ) {
    // Same guard as productService.create — without it, a category from another
    // tenant could be linked here (data-integrity leak across restaurants).
    if (data.categoryId) await categoryService.ensure(tenantId, data.categoryId);
    const a = await prisma.additional.create({ data: { ...data, restaurantId: tenantId } });
    return serializeAdditional(a);
  },
  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; price: number; categoryId: string; active: boolean; kind: AdditionalKind }>,
  ) {
    const a = await prisma.additional.findFirst({ where: { id, restaurantId: tenantId } });
    if (!a) throw new NotFoundError('Adicional');
    if (data.categoryId) await categoryService.ensure(tenantId, data.categoryId);
    const updated = await prisma.additional.update({ where: { id }, data });
    return serializeAdditional(updated);
  },
  async remove(tenantId: string, id: string) {
    const a = await prisma.additional.findFirst({ where: { id, restaurantId: tenantId } });
    if (!a) throw new NotFoundError('Adicional');
    // Mesmo raciocínio do productService.remove() acima: adicional já usado em algum
    // pedido não pode ser apagado, só desativado.
    const orderItemAdditionalCount = await prisma.orderItemAdditional.count({
      where: { additionalId: id },
    });
    if (orderItemAdditionalCount > 0) {
      throw new ConflictError(
        'Este adicional já foi usado em pedidos e não pode ser removido. Marque-o como inativo em vez de excluir.',
      );
    }
    return prisma.additional.delete({ where: { id } });
  },
};

// Insumos (ex.: Laranja) ligados a vários produtos/adicionais. Um toque em "Em falta"
// tira do cardápio tudo que leva o insumo; outro toque devolve. Ver model Ingredient.
type IngredientInput = { name: string; inStock?: boolean; productIds?: string[]; additionalIds?: string[] };

async function assertOwnedLinks(tenantId: string, productIds?: string[], additionalIds?: string[]) {
  if (productIds?.length) {
    const ids = [...new Set(productIds)];
    const n = await prisma.product.count({ where: { id: { in: ids }, restaurantId: tenantId } });
    if (n !== ids.length) throw new NotFoundError('Produto');
  }
  if (additionalIds?.length) {
    const ids = [...new Set(additionalIds)];
    const n = await prisma.additional.count({ where: { id: { in: ids }, restaurantId: tenantId } });
    if (n !== ids.length) throw new NotFoundError('Adicional');
  }
}

function serializeIngredient(i: {
  id: string;
  name: string;
  inStock: boolean;
  products: { id: string }[];
  additionals: { id: string }[];
}) {
  return {
    id: i.id,
    name: i.name,
    inStock: i.inStock,
    productIds: i.products.map((p) => p.id),
    additionalIds: i.additionals.map((a) => a.id),
  };
}
const INGREDIENT_LINKS = { products: { select: { id: true } }, additionals: { select: { id: true } } } as const;

export const ingredientService = {
  async list(tenantId: string) {
    const rows = await prisma.ingredient.findMany({
      where: { restaurantId: tenantId },
      include: INGREDIENT_LINKS,
      orderBy: { name: 'asc' },
    });
    return rows.map(serializeIngredient);
  },
  async create(tenantId: string, data: IngredientInput) {
    await assertOwnedLinks(tenantId, data.productIds, data.additionalIds);
    const exists = await prisma.ingredient.findFirst({
      where: { restaurantId: tenantId, name: { equals: data.name, mode: 'insensitive' } },
    });
    if (exists) throw new ConflictError(`Já existe um insumo chamado "${exists.name}".`);
    const row = await prisma.ingredient.create({
      data: {
        name: data.name,
        inStock: data.inStock ?? true,
        restaurantId: tenantId,
        products: { connect: (data.productIds ?? []).map((id) => ({ id })) },
        additionals: { connect: (data.additionalIds ?? []).map((id) => ({ id })) },
      },
      include: INGREDIENT_LINKS,
    });
    return serializeIngredient(row);
  },
  async update(tenantId: string, id: string, data: Partial<IngredientInput>) {
    await ingredientService.ensure(tenantId, id);
    await assertOwnedLinks(tenantId, data.productIds, data.additionalIds);
    if (data.name) {
      const clash = await prisma.ingredient.findFirst({
        where: { restaurantId: tenantId, name: { equals: data.name, mode: 'insensitive' }, NOT: { id } },
      });
      if (clash) throw new ConflictError(`Já existe um insumo chamado "${clash.name}".`);
    }
    const row = await prisma.ingredient.update({
      where: { id },
      data: {
        name: data.name,
        inStock: data.inStock,
        products: data.productIds ? { set: data.productIds.map((pid) => ({ id: pid })) } : undefined,
        additionals: data.additionalIds ? { set: data.additionalIds.map((aid) => ({ id: aid })) } : undefined,
      },
      include: INGREDIENT_LINKS,
    });
    return serializeIngredient(row);
  },
  async remove(tenantId: string, id: string) {
    await ingredientService.ensure(tenantId, id);
    // Só desliga os vínculos (tabelas de junção em cascata); produtos/adicionais ficam.
    return prisma.ingredient.delete({ where: { id } });
  },
  async ensure(tenantId: string, id: string) {
    const i = await prisma.ingredient.findFirst({ where: { id, restaurantId: tenantId } });
    if (!i) throw new NotFoundError('Insumo');
    return i;
  },
};

// Bairros + taxa de entrega, usados pelo site público de pedidos (delivery) pra calcular
// o frete conforme o bairro escolhido pelo cliente.
export const deliveryZoneService = {
  async list(tenantId: string, params: { onlyActive?: boolean } = {}) {
    const where: Prisma.DeliveryZoneWhereInput = { restaurantId: tenantId };
    if (params.onlyActive) where.active = true;
    const zones = await prisma.deliveryZone.findMany({ where, orderBy: { name: 'asc' } });
    return zones.map(serializeDeliveryZone);
  },
  async create(tenantId: string, data: { name: string; fee: number; active?: boolean }) {
    const z = await prisma.deliveryZone.create({ data: { ...data, restaurantId: tenantId } });
    return serializeDeliveryZone(z);
  },
  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; fee: number; active: boolean }>,
  ) {
    await deliveryZoneService.ensure(tenantId, id);
    const z = await prisma.deliveryZone.update({ where: { id }, data });
    return serializeDeliveryZone(z);
  },
  async remove(tenantId: string, id: string) {
    await deliveryZoneService.ensure(tenantId, id);
    return prisma.deliveryZone.delete({ where: { id } });
  },
  async ensure(tenantId: string, id: string) {
    const z = await prisma.deliveryZone.findFirst({ where: { id, restaurantId: tenantId } });
    if (!z) throw new NotFoundError('Bairro');
    return z;
  },
};
