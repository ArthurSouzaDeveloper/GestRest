import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, ProductionStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { paymentService } from './payment.service';
import { userService } from './user.service';
import { autoAcceptService } from './autoAccept.service';
import { ConflictError, AppError } from '../../utils/errors';

/**
 * Testes de integração (banco real) pro papel MOTOBOY: cria conta com esse perfil, e
 * cobre o fluxo completo de "marcar entregue" — que já existia (paymentService.
 * deliverOnline, reaproveita pay()) mas nunca tinha teste dedicado até essa role passar a
 * expor essa ação pra um perfil novo, sem acesso a mais nada do sistema.
 */
describe('papel MOTOBOY', () => {
  let restaurantId: string;
  let adminId: string;
  let productId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Motoboy', slug: `teste-motoboy-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const admin = await prisma.user.create({
      data: { name: 'Admin', email: `admin-motoboy-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.ADMIN, restaurantId },
    });
    adminId = admin.id;
    const category = await prisma.category.create({
      data: { name: 'Categoria', station: Station.KITCHEN, restaurantId },
    });
    productId = (
      await prisma.product.create({ data: { name: 'Produto', price: 20, categoryId: category.id, restaurantId } })
    ).id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.user.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('um ADMIN consegue criar um usuário com o perfil MOTOBOY', async () => {
    const motoboy = await userService.create(
      restaurantId,
      { name: 'Motoboy', email: `motoboy-${randomUUID()}@teste.local`, password: 'Senha123', role: Role.MOTOBOY },
      { userId: adminId },
    );
    expect(motoboy.role).toBe(Role.MOTOBOY);
  });

  async function openReadyDelivery() {
    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Motoboy', fee: 5, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Entrega',
      customerPhone: '11999997777',
      declaredPaymentMethod: PaymentMethod.CASH,
      changeFor: 50,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Teste',
      deliveryNumber: '10',
      items: [{ productId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await orderService.setItemStatus(item.id, ProductionStatus.DONE, { userId: adminId, tenantId: restaurantId, role: Role.ADMIN });

    const ready = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(ready.status).toBe(OrderStatus.READY_FOR_PAYMENT);
    return order.id;
  }

  it('motoboy marca como entregue: pedido de entrega pronto vira PAGO e registra o pagamento', async () => {
    const motoboy = await prisma.user.create({
      data: { name: 'Motoboy Entrega', email: `motoboy-entrega-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.MOTOBOY, restaurantId },
    });
    const orderId = await openReadyDelivery();

    const result = await paymentService.deliverOnline(orderId, { userId: motoboy.id, tenantId: restaurantId });
    expect(result?.status).toBe(OrderStatus.PAID);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.method).toBe(PaymentMethod.CASH);
    expect(payment.cashierId).toBe(motoboy.id);
    // Total = subtotal (20) + taxa de entrega da zona (5).
    expect(Number(payment.amount)).toBe(25);
  });

  it('não deixa marcar como entregue um pedido que ainda não está pronto', async () => {
    const zone = await prisma.deliveryZone.create({ data: { name: 'Zona Motoboy 2', fee: 5, restaurantId } });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Ainda Preparando',
      customerPhone: '11999996666',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Teste',
      deliveryNumber: '11',
      items: [{ productId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    await expect(
      paymentService.deliverOnline(order.id, { userId: adminId, tenantId: restaurantId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('não deixa marcar como entregue uma comanda de mesa (não é pedido online)', async () => {
    const table = await prisma.restaurantTable.create({ data: { number: 601, restaurantId } });
    const dineIn = await orderService.open({ tableId: table.id }, { userId: adminId, tenantId: restaurantId, role: Role.ADMIN });

    await expect(
      paymentService.deliverOnline(dineIn!.id, { userId: adminId, tenantId: restaurantId }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
