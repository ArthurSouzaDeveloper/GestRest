import { TableStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { emitTo, ROOMS } from '../../socket';

export const tableService = {
  list() {
    return prisma.restaurantTable.findMany({
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { notIn: ['PAID', 'CANCELLED'] } },
          select: { id: true, status: true, openedAt: true },
        },
      },
    });
  },

  async get(id: string) {
    const t = await prisma.restaurantTable.findUnique({ where: { id } });
    if (!t) throw new NotFoundError('Mesa');
    return t;
  },

  create(data: { number: number; seats?: number }) {
    return prisma.restaurantTable.create({ data });
  },

  async setStatus(id: string, status: TableStatus) {
    const table = await prisma.restaurantTable.update({ where: { id }, data: { status } });
    emitTo([ROOMS.FLOOR, ROOMS.DASHBOARD], 'table:updated', table);
    return table;
  },

  async remove(id: string) {
    await tableService.get(id);
    return prisma.restaurantTable.delete({ where: { id } });
  },
};
