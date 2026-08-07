import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';

export const tableService = {
  list(tenantId: string) {
    return prisma.restaurantTable.findMany({
      where: { restaurantId: tenantId },
      orderBy: { number: 'asc' },
      include: {
        // Several comandas can be active on the same table at once (big groups splitting
        // into separate tabs) — the caller needs enough per-comanda detail to list them.
        orders: {
          where: { status: { notIn: ['PAID', 'CANCELLED'] } },
          select: {
            id: true,
            number: true,
            status: true,
            openedAt: true,
            peopleCount: true,
            customer: { select: { name: true } },
          },
          orderBy: { openedAt: 'asc' },
        },
      },
    });
  },

  async get(tenantId: string, id: string) {
    const t = await prisma.restaurantTable.findFirst({ where: { id, restaurantId: tenantId } });
    if (!t) throw new NotFoundError('Mesa');
    return t;
  },

  create(tenantId: string, data: { number: number; seats?: number }) {
    return prisma.restaurantTable.create({ data: { ...data, restaurantId: tenantId } });
  },

  async remove(tenantId: string, id: string) {
    await tableService.get(tenantId, id);
    return prisma.restaurantTable.delete({ where: { id } });
  },
};
