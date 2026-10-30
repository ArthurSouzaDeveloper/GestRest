import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, ProductionStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { autoAcceptService } from './autoAccept.service';
import { autoCompleteService } from './autoComplete.service';

/**
 * Testes de integração (banco real) pra conclusão automática pelo tempo estimado: sweep()
 * conclui (itens prontos + pago) retirada e entrega aceitas que passaram do horário previsto
 * + margem, e nunca mexe em quem não deveria (antes do prazo, PENDING, cancelado, já pago,
 * flag desligada).
 */
describe('conclusão automática pelo tempo estimado (autoCompleteService)', () => {
  let restaurantId: string;
  let adminId: string;
  let productId: string;
  let zoneId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Conclusão Automática', slug: `teste-auto-conclusao-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const admin = await prisma.user.create({
      data: {
        name: 'Admin',
        email: `admin-auto-conclusao-${randomUUID()}@teste.local`,
        passwordHash: 'x',
        role: Role.ADMIN,
        restaurantId,
      },
    });
    adminId = admin.id;
    const category = await prisma.category.create({
      data: { name: 'Categoria', station: Station.KITCHEN, restaurantId },
    });
    productId = (
      await prisma.product.create({ data: { name: 'Produto', price: 15, categoryId: category.id, restaurantId } })
    ).id;
    zoneId = (await prisma.deliveryZone.create({ data: { name: 'Zona Auto Conclusão', fee: 5, restaurantId } })).id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.user.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  async function open(orderType: 'PICKUP' | 'DELIVERY', autoAccept = true) {
    await autoAcceptService.update(restaurantId, { enabled: autoAccept });
    const order = await orderService.openPublic(restaurantId, {
      orderType,
      customerName: 'Cliente Teste',
      customerPhone: '11999995555',
      customerCpf: `2000000${Math.floor(Math.random() * 9000 + 1000)}`,
      declaredPaymentMethod: PaymentMethod.PIX,
      ...(orderType === 'DELIVERY' ? { deliveryZoneId: zoneId, deliveryStreet: 'Rua Teste', deliveryNumber: '1' } : {}),
      items: [{ productId, quantity: 2 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });
    return order.id;
  }

  /** Simula um pedido feito há `minutesAgo` com previsão de `etaMinutes`. */
  async function backdate(orderId: string, minutesAgo: number, etaMinutes: number) {
    const createdAt = new Date(Date.now() - minutesAgo * 60_000);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        createdAt,
        acceptedAt: createdAt,
        estimatedReadyAt: new Date(createdAt.getTime() + etaMinutes * 60_000),
      },
    });
  }

  const sweep = () => autoCompleteService.sweep({ restaurantId });
  const status = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  it('já nasce ligada com 10 min de margem', async () => {
    await expect(autoCompleteService.get(restaurantId)).resolves.toEqual({ marginMinutes: 10 });
  });

  it('conclui uma ENTREGA ainda em produção que passou do previsto + margem (itens prontos, pago)', async () => {
    const orderId = await open('DELIVERY');
    await backdate(orderId, 60, 45); // previsto há 15 min, margem 10 → venceu

    await sweep();

    expect(await status(orderId)).toBe(OrderStatus.PAID);
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    expect(items.every((i) => i.status === ProductionStatus.DONE)).toBe(true);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.cashierId).toBe(adminId);
    expect(payment.method).toBe(PaymentMethod.PIX);

    // Idempotente: rodar de novo não gera outro pagamento.
    await sweep();
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
  });

  it('conclui uma RETIRADA que passou do previsto + margem', async () => {
    const orderId = await open('PICKUP');
    await backdate(orderId, 45, 30);
    await sweep();
    expect(await status(orderId)).toBe(OrderStatus.PAID);
  });

  it('não conclui dentro da margem de 10 min', async () => {
    const orderId = await open('PICKUP');
    await backdate(orderId, 35, 30); // previsto há 5 min, ainda na margem
    await sweep();
    expect(await status(orderId)).toBe(OrderStatus.OPEN);
  });

  it('aceite atrasado empurra o prazo: conta o tempo previsto a partir do aceite', async () => {
    const orderId = await open('PICKUP');
    const createdAt = new Date(Date.now() - 60 * 60_000);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        createdAt,
        estimatedReadyAt: new Date(createdAt.getTime() + 30 * 60_000),
        acceptedAt: new Date(Date.now() - 5 * 60_000), // aceito só há 5 min
      },
    });
    await sweep();
    expect(await status(orderId)).toBe(OrderStatus.OPEN);
  });

  it('nunca toca em pedido aguardando aceite (PENDING) nem cancelado', async () => {
    const pendingId = await open('PICKUP', false);
    await backdate(pendingId, 120, 30);
    await prisma.order.update({ where: { id: pendingId }, data: { acceptedAt: null } });

    const cancelledId = await open('PICKUP');
    await backdate(cancelledId, 120, 30);
    await orderService.cancel(cancelledId, { userId: adminId, tenantId: restaurantId, role: Role.ADMIN });

    await sweep();

    expect(await status(pendingId)).toBe(OrderStatus.PENDING);
    expect(await status(cancelledId)).toBe(OrderStatus.CANCELLED);
    expect(await prisma.payment.count({ where: { orderId: { in: [pendingId, cancelledId] } } })).toBe(0);
  });

  it('com a flag desligada (null) não mexe em nada', async () => {
    await autoCompleteService.update(restaurantId, { marginMinutes: null });
    const orderId = await open('DELIVERY');
    await backdate(orderId, 120, 45);
    await sweep();
    expect(await status(orderId)).toBe(OrderStatus.OPEN);
    await autoCompleteService.update(restaurantId, { marginMinutes: 10 });
  });
});
