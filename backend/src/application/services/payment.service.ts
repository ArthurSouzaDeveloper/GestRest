import { AuditAction, OrderStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { emitTenant, ROOMS } from '../../socket';
import { auditService } from './audit.service';
import { computeTotals, orderInclude, serializeOrder, syncTableStatus } from './order.helpers';

interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
}

interface Ctx {
  userId: string;
  ip?: string;
  tenantId: string;
}

export const paymentService = {
  /** Registers one or more payment lines (mixed payment) and closes the order. */
  async pay(orderId: string, lines: PaymentLine[], ctx: Ctx) {
    if (lines.length === 0) throw new AppError('Nenhum pagamento informado');

    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: ctx.tenantId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError('Pedido');
    if (order.status === OrderStatus.PAID) throw new ConflictError('Pedido já pago');
    if (order.status !== OrderStatus.READY_FOR_PAYMENT) {
      throw new ConflictError('Pedido ainda não está pronto para pagamento');
    }

    const totals = computeTotals(order);
    const totalPaid = lines.reduce((acc, l) => acc + l.amount, 0);
    if (totalPaid + 0.001 < totals.remaining) {
      throw new AppError(
        `Valor insuficiente. Faltam R$ ${(totals.remaining - totalPaid).toFixed(2)}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        let change = 0;
        if (line.method === PaymentMethod.CASH && line.cashReceived) {
          change = Math.max(0, line.cashReceived - line.amount);
        }
        await tx.payment.create({
          data: {
            orderId,
            restaurantId: ctx.tenantId,
            method: line.method,
            amount: line.amount,
            change,
            cashierId: ctx.userId,
          },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID, closedAt: new Date() },
      });
      // Other comandas may still be active at this table — recompute from all of them
      // rather than assuming the table is free just because this one comanda paid out.
      await syncTableStatus(order.tableId, tx);
    });

    await auditService.record({
      action: AuditAction.PAYMENT_RECEIVED,
      userId: ctx.userId,
      restaurantId: ctx.tenantId,
      entity: 'Order',
      entityId: orderId,
      ip: ctx.ip,
      metadata: { total: totals.total, methods: lines.map((l) => l.method) },
    });

    const updated = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    const payload = updated ? serializeOrder(updated) : null;
    emitTenant(ctx.tenantId, [ROOMS.FLOOR, ROOMS.CASHIER, ROOMS.DASHBOARD], 'order:paid', payload);
    return payload;
  },
};
