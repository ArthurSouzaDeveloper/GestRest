import { Prisma, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

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
  list(
    tenantId: string,
    params: { search?: string; categoryId?: string; onlyAvailable?: boolean } = {},
  ) {
    const where: Prisma.ProductWhereInput = { restaurantId: tenantId };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyAvailable) where.available = true;
    return prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  },
  async get(tenantId: string, id: string) {
    const p = await prisma.product.findFirst({
      where: { id, restaurantId: tenantId },
      include: { category: true },
    });
    if (!p) throw new NotFoundError('Produto');
    return p;
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
    return prisma.product.create({ data: { ...data, restaurantId: tenantId } });
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
    return prisma.product.update({ where: { id }, data });
  },
  async remove(tenantId: string, id: string) {
    await productService.get(tenantId, id);
    return prisma.product.delete({ where: { id } });
  },
};

export const additionalService = {
  list(tenantId: string, params: { categoryId?: string; onlyActive?: boolean } = {}) {
    const where: Prisma.AdditionalWhereInput = { restaurantId: tenantId };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyActive) where.active = true;
    return prisma.additional.findMany({ where, orderBy: { name: 'asc' } });
  },
  async create(
    tenantId: string,
    data: { name: string; price: number; categoryId?: string; active?: boolean },
  ) {
    // Same guard as productService.create — without it, a category from another
    // tenant could be linked here (data-integrity leak across restaurants).
    if (data.categoryId) await categoryService.ensure(tenantId, data.categoryId);
    return prisma.additional.create({ data: { ...data, restaurantId: tenantId } });
  },
  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; price: number; categoryId: string; active: boolean }>,
  ) {
    const a = await prisma.additional.findFirst({ where: { id, restaurantId: tenantId } });
    if (!a) throw new NotFoundError('Adicional');
    if (data.categoryId) await categoryService.ensure(tenantId, data.categoryId);
    return prisma.additional.update({ where: { id }, data });
  },
  async remove(tenantId: string, id: string) {
    const a = await prisma.additional.findFirst({ where: { id, restaurantId: tenantId } });
    if (!a) throw new NotFoundError('Adicional');
    return prisma.additional.delete({ where: { id } });
  },
};
