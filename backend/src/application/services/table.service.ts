import { TableStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { emitTenant, ROOMS } from '../../socket';

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

  async setStatus(tenantId: string, id: string, status: TableStatus) {
    await tableService.get(tenantId, id);
    const table = await prisma.restaurantTable.update({ where: { id }, data: { status } });
    emitTenant(tenantId, [ROOMS.FLOOR, ROOMS.DASHBOARD], 'table:updated', table);
    return table;
  },

  async remove(tenantId: string, id: string) {
    await tableService.get(tenantId, id);
    return prisma.restaurantTable.delete({ where: { id } });
  },
};
