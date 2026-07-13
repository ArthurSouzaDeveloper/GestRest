import { TableStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { emitTo, ROOMS } from '../../socket';

export const tableService = {
  list(tenantId: string) {
    return prisma.restaurantTable.findMany({
      where: { restaurantId: tenantId },
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { notIn: ['PAID', 'CANCELLED'] } },
          select: { id: true, status: true, openedAt: true },
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

  async setStatus(tenantId: string, id: string, status: TableStatus) {
    await tableService.get(tenantId, id);
    const table = await prisma.restaurantTable.update({ where: { id }, data: { status } });
    emitTo([ROOMS.FLOOR, ROOMS.DASHBOARD], 'table:updated', table);
    return table;
  },

  async remove(tenantId: string, id: string) {
    await tableService.get(tenantId, id);
    return prisma.restaurantTable.delete({ where: { id } });
  },
};
