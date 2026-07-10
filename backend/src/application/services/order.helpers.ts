import { Prisma } from '@prisma/client';

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
