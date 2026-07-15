import { ProductionStatus, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';

/**
 * Returns the live production queue for a station: all items that are not yet
 * done or cancelled, oldest first, with the context each screen needs.
 */
export const productionService = {
  async queue(tenantId: string, station: Station) {
    const items = await prisma.orderItem.findMany({
      where: {
        station,
        status: { in: [ProductionStatus.WAITING, ProductionStatus.PREPARING] },
        order: { restaurantId: tenantId, status: { notIn: ['PAID', 'CANCELLED'] } },
      },
      include: {
        product: { include: { category: true } },
        additionals: true,
        order: {
          include: {
            table: { select: { number: true } },
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((item) => {
      const waitingMs = Date.now() - item.createdAt.getTime();
      const waitingMin = Math.floor(waitingMs / 60000);
      return {
        id: item.id,
        orderId: item.orderId,
        tableNumber: item.order.table.number,
        // A table can have several comandas open at once — the order number tells them
        // apart on the ticket even when neither comanda has a customer name set.
        orderNumber: item.order.number,
        customerName: item.order.customer?.name ?? null,
        productName: item.product.name,
        avgPrepMin: item.product.avgPrepMin,
        quantity: item.quantity,
        notes: item.notes,
        additionals: item.additionals.map((a) => a.name),
        status: item.status,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        waitingMin,
        // Flag tickets waiting longer than the product's average prep time.
        critical: waitingMin >= item.product.avgPrepMin,
      };
    });
  },
};
