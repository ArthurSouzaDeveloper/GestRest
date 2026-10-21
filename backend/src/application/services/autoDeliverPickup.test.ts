import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, ProductionStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { autoAcceptService } from './autoAccept.service';
import { autoDeliverPickupService } from './autoDeliverPickup.service';

/**
 * Testes de integração (banco real) pra entrega automática de retirada: readyAt sendo
 * carimbado por syncOrderStatus (order.service.ts), e sweep() fechando sozinho só quem
 * deveria (retirada, "Pronto" há tempo suficiente, restaurante com a flag ligada) — nunca
 * entrega (delivery), nunca antes do tempo, nunca com a flag desligada/null.
 */
describe('entrega automática de retirada (autoDeliverPickupService)', () => {
  let restaurantId: string;
  let adminId: string;
  let productId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Entrega Automática', slug: `teste-auto-entrega-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const admin = await prisma.user.create({
      data: {
        name: 'Admin',
        email: `admin-auto-entrega-${randomUUID()}@teste.local`,
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
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.user.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  /** Abre um pedido (retirada ou entrega) e já deixa "Pronto" (todos os itens DONE). */
  async function openReady(orderType: 'PICKUP' | 'DELIVERY', zoneId?: string) {
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType,
      customerName: 'Cliente Teste',
      customerPhone: '11999995555',
      customerCpf: `1000000${Math.floor(Math.random() * 9000 + 1000)}`,
      declaredPaymentMethod: PaymentMethod.CASH,
      ...(orderType === 'DELIVERY'
        ? { deliveryZoneId: zoneId, deliveryStreet: 'Rua Teste', deliveryNumber: '1' }
        : {}),
      items: [{ productId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await orderService.setItemStatus(item.id, ProductionStatus.DONE, {
      userId: adminId,
      tenantId: restaurantId,
      role: Role.ADMIN,
    });

    const ready = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(ready.status).toBe(OrderStatus.READY_FOR_PAYMENT);
    expect(ready.readyAt).not.toBeNull();
    return order.id;
  }

  it('syncOrderStatus carimba readyAt quando o pedido fica "Pronto"', async () => {
    const orderId = await openReady('PICKUP');
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.readyAt).not.toBeNull();
  });

  it('com a flag desligada (null, padrão), sweep() não mexe em nada mesmo com pedido pronto há muito tempo', async () => {
    await autoDeliverPickupService.update(restaurantId, { minutes: null });
    const orderId = await openReady('PICKUP');
    await prisma.order.update({ where: { id: orderId }, data: { readyAt: new Date(Date.now() - 60 * 60_000) } });

    await autoDeliverPickupService.sweep();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_FOR_PAYMENT);
  });

  it('com a flag ligada, sweep() NÃO fecha uma retirada que ainda não passou do tempo configurado', async () => {
    await autoDeliverPickupService.update(restaurantId, { minutes: 15 });
    const orderId = await openReady('PICKUP');
    // readyAt "agora" — ainda não passou os 15 minutos configurados.

    await autoDeliverPickupService.sweep();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_FOR_PAYMENT);
  });

  it('com a flag ligada, sweep() fecha sozinha uma retirada "Pronto" há mais tempo que o configurado', async () => {
    await autoDeliverPickupService.update(restaurantId, { minutes: 15 });
    const orderId = await openReady('PICKUP');
    await prisma.order.update({ where: { id: orderId }, data: { readyAt: new Date(Date.now() - 16 * 60_000) } });

    await autoDeliverPickupService.sweep();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.PAID);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.cashierId).toBe(adminId);
  });

  it('nunca fecha sozinho um pedido de ENTREGA, mesmo com a flag ligada e pronto há muito tempo', async () => {
    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Auto Entrega', fee: 5, restaurantId } });
    await autoDeliverPickupService.update(restaurantId, { minutes: 15 });
    const orderId = await openReady('DELIVERY', zone.id);
    await prisma.order.update({ where: { id: orderId }, data: { readyAt: new Date(Date.now() - 60 * 60_000) } });

    await autoDeliverPickupService.sweep();

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.READY_FOR_PAYMENT);
  });

  it('autoDeliverPickupService.get()/update() refletem o valor salvo', async () => {
    await autoDeliverPickupService.update(restaurantId, { minutes: 20 });
    await expect(autoDeliverPickupService.get(restaurantId)).resolves.toEqual({ minutes: 20 });
    await autoDeliverPickupService.update(restaurantId, { minutes: null });
    await expect(autoDeliverPickupService.get(restaurantId)).resolves.toEqual({ minutes: null });
  });
});
