import { prisma } from '../../config/prisma';
import { ConflictError, NotFoundError } from '../../utils/errors';

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
    // Uma mesa com pedidos (mesmo antigos e já pagos) nunca pode ser apagada — isso levaria
    // o histórico de vendas junto (banco recusa com Restrict, mas checar antes dá uma
    // mensagem clara em vez do erro cru de constraint).
    const orderCount = await prisma.order.count({ where: { tableId: id } });
    if (orderCount > 0) {
      throw new ConflictError(
        'Esta mesa tem pedidos no histórico e não pode ser removida. Isso preserva o registro de vendas.',
      );
    }
    return prisma.restaurantTable.delete({ where: { id } });
  },
};
