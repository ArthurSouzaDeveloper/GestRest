import {
  AuditAction,
  OrderStatus,
  Prisma,
  ProductionStatus,
  Station,
  TableStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { emitTenant, ROOMS } from '../../socket';
import { auditService } from './audit.service';
import { orderInclude, serializeOrder } from './order.helpers';

interface Ctx {
  userId: string;
  ip?: string;
  tenantId: string;
}

interface NewItemInput {
  productId: string;
  quantity: number;
  notes?: string;
  additionalIds?: string[];
}

const stationRoom: Record<Station, string | null> = {
  [Station.KITCHEN]: ROOMS.KITCHEN,
  [Station.JUICE_BAR]: ROOMS.JUICE_BAR,
  [Station.NONE]: null,
};

/** Recomputes order status from item statuses and syncs the table status. */
async function syncOrderStatus(orderId: string, tx: Prisma.TransactionClient = prisma) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.status === OrderStatus.PAID || order.status === OrderStatus.CANCELLED) return;

  const active = order.items.filter((i) => i.status !== ProductionStatus.CANCELLED);

  let status: OrderStatus = OrderStatus.OPEN;
  if (active.length > 0) {
    const allDone = active.every((i) => i.status === ProductionStatus.DONE);
    status = allDone ? OrderStatus.READY_FOR_PAYMENT : OrderStatus.IN_PRODUCTION;
  }

  const tableStatus: TableStatus =
    status === OrderStatus.READY_FOR_PAYMENT
      ? TableStatus.READY_FOR_PAYMENT
      : status === OrderStatus.IN_PRODUCTION
        ? TableStatus.IN_PRODUCTION
        : TableStatus.OCCUPIED;

  await tx.order.update({ where: { id: orderId }, data: { status } });
  await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: tableStatus } });
}

async function loadAndBroadcast(tenantId: string, orderId: string, event: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) return null;
  const payload = serializeOrder(order);
  emitTenant(tenantId, [ROOMS.FLOOR, ROOMS.CASHIER, ROOMS.DASHBOARD], event, payload);
  return payload;
}

/** Loads an order scoped to the tenant, or throws. */
async function requireOrder(tenantId: string, id: string) {
  const order = await prisma.order.findFirst({ where: { id, restaurantId: tenantId } });
  if (!order) throw new NotFoundError('Pedido');
  return order;
}

export const orderService = {
  async list(tenantId: string, params: { status?: OrderStatus; tableId?: string } = {}) {
    const where: Prisma.OrderWhereInput = { restaurantId: tenantId };
    if (params.status) where.status = params.status;
    if (params.tableId) where.tableId = params.tableId;
    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { openedAt: 'desc' },
    });
    return orders.map(serializeOrder);
  },

  async get(tenantId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, restaurantId: tenantId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError('Pedido');
    return serializeOrder(order);
  },

  async open(
    input: { tableId: string; customerName?: string; peopleCount?: number; notes?: string },
    ctx: Ctx,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: input.tableId, restaurantId: ctx.tenantId },
    });
    if (!table) throw new NotFoundError('Mesa');
    if (table.status !== TableStatus.FREE) throw new ConflictError('Mesa não está livre');

    const order = await prisma.$transaction(async (tx) => {
      let customerId: string | undefined;
      if (input.customerName?.trim()) {
        const customer = await tx.customer.create({
          data: { name: input.customerName.trim(), restaurantId: ctx.tenantId },
        });
        customerId = customer.id;
      }
      const created = await tx.order.create({
        data: {
          restaurantId: ctx.tenantId,
          tableId: input.tableId,
          customerId,
          waiterId: ctx.userId,
          peopleCount: input.peopleCount ?? 1,
          notes: input.notes,
        },
      });
      await tx.restaurantTable.update({
        where: { id: input.tableId },
        data: { status: TableStatus.OCCUPIED },
      });
      return created;
    });

    await auditService.record({
      action: AuditAction.TABLE_OPENED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'Order',
      entityId: order.id,
      ip: ctx.ip,
      metadata: { tableId: input.tableId },
    });

    emitTenant(ctx.tenantId, [ROOMS.FLOOR, ROOMS.DASHBOARD], 'table:updated', { id: input.tableId });
    return loadAndBroadcast(ctx.tenantId, order.id, 'order:created');
  },

  async addItems(orderId: string, items: NewItemInput[], ctx: Ctx) {
    if (items.length === 0) throw new AppError('Nenhum item informado');
    const order = await requireOrder(ctx.tenantId, orderId);
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.CANCELLED) {
      throw new ConflictError('Pedido já finalizado');
    }

    const touchedStations = new Set<Station>();

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, restaurantId: ctx.tenantId },
          include: { category: true },
        });
        if (!product) throw new NotFoundError('Produto');
        if (!product.available) throw new AppError(`Produto indisponível: ${product.name}`);

        const station = product.category.station;
        touchedStations.add(station);

        const additionals = item.additionalIds?.length
          ? await tx.additional.findMany({
              where: { id: { in: item.additionalIds }, restaurantId: ctx.tenantId },
            })
          : [];

        await tx.orderItem.create({
          data: {
            orderId,
            productId: product.id,
            quantity: Math.max(1, item.quantity),
            unitPrice: product.price,
            notes: item.notes,
            station,
            status: station === Station.NONE ? ProductionStatus.DONE : ProductionStatus.WAITING,
            additionals: {
              create: additionals.map((a) => ({
                additionalId: a.id,
                name: a.name,
                price: a.price,
              })),
            },
          },
        });
      }
      await syncOrderStatus(orderId, tx);
    });

    await auditService.record({
      action: AuditAction.ITEM_ADDED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'Order',
      entityId: orderId,
      ip: ctx.ip,
      metadata: { count: items.length },
    });

    const rooms = [...touchedStations]
      .map((s) => stationRoom[s])
      .filter((r): r is string => Boolean(r));
    if (rooms.length) emitTenant(ctx.tenantId, rooms, 'production:updated', { orderId });

    return loadAndBroadcast(ctx.tenantId, orderId, 'order:updated');
  },

  async setItemStatus(itemId: string, status: ProductionStatus, ctx: Ctx) {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, order: { restaurantId: ctx.tenantId } },
    });
    if (!item) throw new NotFoundError('Item');

    const data: Prisma.OrderItemUpdateInput = { status };
    if (status === ProductionStatus.PREPARING && !item.startedAt) data.startedAt = new Date();
    if (status === ProductionStatus.DONE) data.finishedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: itemId }, data });
      await syncOrderStatus(item.orderId, tx);
    });

    await auditService.record({
      action: AuditAction.STATUS_CHANGED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'OrderItem',
      entityId: itemId,
      ip: ctx.ip,
      metadata: { status },
    });

    const room = stationRoom[item.station];
    if (room) emitTenant(ctx.tenantId, [room], 'production:updated', { orderId: item.orderId });
    return loadAndBroadcast(ctx.tenantId, item.orderId, 'order:updated');
  },

  async updateItem(itemId: string, data: { quantity?: number; notes?: string }, ctx: Ctx) {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, order: { restaurantId: ctx.tenantId } },
    });
    if (!item) throw new NotFoundError('Item');
    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity: data.quantity !== undefined ? Math.max(1, data.quantity) : undefined,
        notes: data.notes,
      },
    });
    await auditService.record({
      action: AuditAction.ITEM_UPDATED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'OrderItem',
      entityId: itemId,
      ip: ctx.ip,
    });
    return loadAndBroadcast(ctx.tenantId, item.orderId, 'order:updated');
  },

  async cancelItem(itemId: string, ctx: Ctx) {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, order: { restaurantId: ctx.tenantId } },
    });
    if (!item) throw new NotFoundError('Item');
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { status: ProductionStatus.CANCELLED },
      });
      await syncOrderStatus(item.orderId, tx);
    });
    await auditService.record({
      action: AuditAction.ITEM_REMOVED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'OrderItem',
      entityId: itemId,
      ip: ctx.ip,
    });
    const room = stationRoom[item.station];
    if (room) emitTenant(ctx.tenantId, [room], 'production:updated', { orderId: item.orderId });
    return loadAndBroadcast(ctx.tenantId, item.orderId, 'order:updated');
  },

  async updateOrder(
    id: string,
    data: { discount?: number; serviceRate?: number; notes?: string; version?: number },
    ctx: Ctx,
  ) {
    const order = await requireOrder(ctx.tenantId, id);
    if (data.version !== undefined && data.version !== order.version) {
      throw new ConflictError('O pedido foi alterado por outro usuário. Recarregue e tente novamente.');
    }
    await prisma.order.update({
      where: { id },
      data: {
        discount: data.discount,
        serviceRate: data.serviceRate,
        notes: data.notes,
        version: { increment: 1 },
      },
    });
    await auditService.record({
      action: AuditAction.ORDER_UPDATED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'Order',
      entityId: id,
      ip: ctx.ip,
    });
    return loadAndBroadcast(ctx.tenantId, id, 'order:updated');
  },

  async cancel(id: string, ctx: Ctx) {
    const order = await requireOrder(ctx.tenantId, id);
    if (order.status === OrderStatus.PAID) throw new ConflictError('Pedido já pago');

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { status: ProductionStatus.CANCELLED },
      });
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED, closedAt: new Date() },
      });
      await tx.restaurantTable.update({
        where: { id: order.tableId },
        data: { status: TableStatus.FREE },
      });
    });

    await auditService.record({
      action: AuditAction.ORDER_CANCELLED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'Order',
      entityId: id,
      ip: ctx.ip,
    });
    emitTenant(ctx.tenantId, [ROOMS.KITCHEN, ROOMS.JUICE_BAR], 'production:updated', { orderId: id });
    return loadAndBroadcast(ctx.tenantId, id, 'order:updated');
  },
};

export { serializeOrder };
