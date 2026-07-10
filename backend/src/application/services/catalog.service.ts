import { Prisma, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

export const categoryService = {
  list() {
    return prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  },
  create(data: { name: string; station: Station; sortOrder?: number }) {
    return prisma.category.create({ data });
  },
  async update(id: string, data: Partial<{ name: string; station: Station; sortOrder: number }>) {
    await categoryService.ensure(id);
    return prisma.category.update({ where: { id }, data });
  },
  async remove(id: string) {
    await categoryService.ensure(id);
    return prisma.category.delete({ where: { id } });
  },
  async ensure(id: string) {
    const c = await prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Categoria');
    return c;
  },
};

export const productService = {
  list(params: { search?: string; categoryId?: string; onlyAvailable?: boolean } = {}) {
    const where: Prisma.ProductWhereInput = {};
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyAvailable) where.available = true;
    return prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  },
  async get(id: string) {
    const p = await prisma.product.findUnique({ where: { id }, include: { category: true } });
    if (!p) throw new NotFoundError('Produto');
    return p;
  },
  create(data: {
    name: string;
    description?: string;
    price: number;
    categoryId: string;
    avgPrepMin?: number;
    imageUrl?: string;
    available?: boolean;
  }) {
    return prisma.product.create({ data });
  },
  async update(id: string, data: Prisma.ProductUpdateInput) {
    await productService.get(id);
    return prisma.product.update({ where: { id }, data });
  },
  async remove(id: string) {
    await productService.get(id);
    return prisma.product.delete({ where: { id } });
  },
};

export const additionalService = {
  list(params: { categoryId?: string; onlyActive?: boolean } = {}) {
    const where: Prisma.AdditionalWhereInput = {};
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.onlyActive) where.active = true;
    return prisma.additional.findMany({ where, orderBy: { name: 'asc' } });
  },
  create(data: { name: string; price: number; categoryId?: string; active?: boolean }) {
    return prisma.additional.create({ data });
  },
  async update(id: string, data: Prisma.AdditionalUpdateInput) {
    const a = await prisma.additional.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Adicional');
    return prisma.additional.update({ where: { id }, data });
  },
  async remove(id: string) {
    const a = await prisma.additional.findUnique({ where: { id } });
    if (!a) throw new NotFoundError('Adicional');
    return prisma.additional.delete({ where: { id } });
  },
};
