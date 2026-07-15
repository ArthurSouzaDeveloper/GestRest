import { OrderStatus, Prisma, TableStatus } from '@prisma/client';

/** Standard include used whenever we return a full order to clients. */
export const orderInclude = {
  table: true,
  customer: true,
  waiter: { select: { id: true, name: true } },
  items: {
    include: {
      product: { include: { category: true } },
      additionals: true,
    },
    orderBy: { createdAt: 'asc' },
  },
  payments: true,
} satisfies Prisma.OrderInclude;

/** Scopes an order lookup by id to a single tenant. */
export function tenantOrderWhere(tenantId: string, id?: string): Prisma.OrderWhereInput {
  return id ? { id, restaurantId: tenantId } : { restaurantId: tenantId };
}

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface OrderTotals {
  subtotal: number;
  serviceFee: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
}

/** Money-safe rounding to 2 decimals. */
const money = (n: number): number => Math.round(n * 100) / 100;

export function computeTotals(order: OrderWithRelations): OrderTotals {
  const subtotal = order.items
    .filter((i) => i.status !== 'CANCELLED')
    .reduce((acc, item) => {
      const additionals = item.additionals.reduce((a, ad) => a + Number(ad.price), 0);
      return acc + (Number(item.unitPrice) + additionals) * item.quantity;
    }, 0);

  const discount = Number(order.discount);
  const serviceFee = money(((subtotal - discount) * Number(order.serviceRate)) / 100);
  const total = money(subtotal - discount + serviceFee);
  const paid = order.payments.reduce((acc, p) => acc + Number(p.amount), 0);

  return {
    subtotal: money(subtotal),
    serviceFee,
    discount: money(discount),
    total,
    paid: money(paid),
    remaining: money(Math.max(0, total - paid)),
  };
}

/**
 * Recomputes a table's status from ALL of its currently active (non-paid, non-cancelled)
 * comandas — a table can have several at once (common for big groups splitting into separate
 * tabs), so its status can no longer be derived from a single order in isolation. Priority
 * favors whichever state still needs attention: any comanda still in production outweighs one
 * that's merely open-with-no-items-yet, which in turn outweighs one that's ready for payment —
 * the table only shows READY_FOR_PAYMENT once every comanda on it is.
 */
export async function syncTableStatus(tableId: string, tx: Prisma.TransactionClient): Promise<void> {
  const activeOrders = await tx.order.findMany({
    where: { tableId, status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] } },
    select: { status: true },
  });

  let status: TableStatus;
  if (activeOrders.length === 0) {
    status = TableStatus.FREE;
  } else if (activeOrders.some((o) => o.status === OrderStatus.IN_PRODUCTION)) {
    status = TableStatus.IN_PRODUCTION;
  } else if (activeOrders.some((o) => o.status === OrderStatus.OPEN)) {
    status = TableStatus.OCCUPIED;
  } else {
    status = TableStatus.READY_FOR_PAYMENT;
  }

  await tx.restaurantTable.update({ where: { id: tableId }, data: { status } });
}

/** Serializes Prisma Decimals to numbers and appends computed totals. */
export function serializeOrder(order: OrderWithRelations) {
  return {
    ...order,
    discount: Number(order.discount),
    serviceRate: Number(order.serviceRate),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      product: { ...item.product, price: Number(item.product.price) },
      additionals: item.additionals.map((a) => ({ ...a, price: Number(a.price) })),
    })),
    payments: order.payments.map((p) => ({ ...p, amount: Number(p.amount), change: Number(p.change) })),
    totals: computeTotals(order),
  };
}
