import { Prisma, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

// Prisma's Decimal serializes to a string over JSON. Left unconverted, arithmetic like
// `product.price + additionalsTotal` on the client silently does string concatenation
// instead of addition (e.g. "16" + 0 => "160").
function serializeProduct<T extends { price: Prisma.Decimal | number }>(p: T) {
  return { ...p, price: Number(p.price) };
}
function serializeAdditional<T extends { price: Prisma.Decimal | number }>(a: T) {
  return { ...a, price: Number(a.price) };
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
    if (params.onlyAvailable) where.available = true;
    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return products.map(serializeProduct);
  },
  async get(tenantId: string, id: string) {
    const p = await prisma.product.findFirst({
      where: { id, restaurantId: tenantId },
      include: { category: true },
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
    return prisma.product.delete({ where: { id } });
  },
};

export const additionalService = {
  async list(tenantId: string, params: { categoryId?: string; onlyActive?: boolean } = {}) {
    const where: Prisma.AdditionalWhereInput = { restaurantId: tenantId };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyActive) where.active = true;
    const additionals = await prisma.additional.findMany({ where, orderBy: { name: 'asc' } });
    return additionals.map(serializeAdditional);
  },
  async create(
    tenantId: string,
    data: { name: string; price: number; categoryId?: string; active?: boolean },
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
    data: Partial<{ name: string; price: number; categoryId: string; active: boolean }>,
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
    return prisma.additional.delete({ where: { id } });
  },
};
