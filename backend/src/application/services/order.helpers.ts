import { AdditionalKind, OrderStatus, Prisma, TableStatus } from '@prisma/client';
import { AppError } from '../../utils/errors';

/**
 * Regra do produto montável ("Monte o Seu"): o preço vem inteiro do sabor-base, então o
 * item precisa de exatamente 1 adicional BASE — sem base seria um item de R$0, com 2+ o
 * cliente pagaria dois pratos num só. Não-montáveis não podem receber BASE nenhuma (base
 * de outro prato colada num pastel comum cobraria dois pratos também).
 */
export function assertCustomProductBase(
  product: { isCustom: boolean; name: string },
  additionals: { kind: AdditionalKind }[],
): void {
  const baseCount = additionals.filter((a) => a.kind === AdditionalKind.BASE).length;
  if (product.isCustom && baseCount !== 1) {
    throw new AppError(`Escolha o sabor-base de "${product.name}"`);
  }
  if (!product.isCustom && baseCount > 0) {
    throw new AppError(`"${product.name}" não aceita sabor-base`);
  }
}

/** Standard include used whenever we return a full order to clients. */
export const orderInclude = {
  table: true,
  customer: true,
  waiter: { select: { id: true, name: true } },
  deliveryZone: true,
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
  deliveryFee: number;
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
  // Comanda de mesa sempre tem deliveryFee 0 (padrão da coluna) — só pedido online usa isto.
  const deliveryFee = Number(order.deliveryFee);
  const serviceFee = money(((subtotal - discount) * Number(order.serviceRate)) / 100);
  const total = money(subtotal - discount + serviceFee + deliveryFee);
  const paid = order.payments.reduce((acc, p) => acc + Number(p.amount), 0);

  return {
    subtotal: money(subtotal),
    serviceFee,
    discount: money(discount),
    deliveryFee: money(deliveryFee),
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
    deliveryFee: Number(order.deliveryFee),
    changeFor: order.changeFor !== null ? Number(order.changeFor) : null,
    deliveryZone: order.deliveryZone ? { ...order.deliveryZone, fee: Number(order.deliveryZone.fee) } : null,
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

/**
 * Versão enxuta pro link público de acompanhamento — o id do pedido (não-adivinhável)
 * já funciona como a "senha" desse link, mas mesmo assim não expõe telefone do cliente,
 * endereço completo nem o id interno do caixa que registrou o pagamento (presentes em
 * serializeOrder(), pensado pra tela autenticada da equipe).
 */
export function serializePublicStatus(order: OrderWithRelations) {
  return {
    number: order.number,
    status: order.status,
    orderType: order.orderType,
    estimatedReadyAt: order.estimatedReadyAt,
    acceptedAt: order.acceptedAt,
    items: order.items
      .filter((i) => i.status !== 'CANCELLED')
      .map((i) => ({ name: i.product.name, quantity: i.quantity, status: i.status })),
    total: computeTotals(order).total,
  };
}
