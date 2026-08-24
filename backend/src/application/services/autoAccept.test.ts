import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { autoAcceptService } from './autoAccept.service';

/**
 * Testes de integração (banco real) para o aceite automático de pedidos online — com a
 * flag desligada (padrão), openPublic() continua criando em PENDING; ligada, já cria
 * direto em OPEN, sem precisar de accept() manual.
 */
describe('aceite automático de pedidos online', () => {
  let restaurantId: string;
  let productId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Aceite Automático', slug: `teste-auto-aceite-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const category = await prisma.category.create({
      data: { name: 'Categoria', station: Station.KITCHEN, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Produto', price: 10, categoryId: category.id, restaurantId },
    });
    productId = product.id;
  });

  afterAll(async () => {
    // PrintJob (se existir por outro teste rodando em paralelo neste schema) cascade de
    // Order; aqui só há Order/OrderItem a limpar antes do Restaurant, mesmo padrão de
    // dataIntegrity.test.ts.
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  const baseInput = {
    orderType: 'PICKUP' as const,
    customerName: 'Cliente Teste',
    customerPhone: '11999998888',
    declaredPaymentMethod: PaymentMethod.CASH,
    items: [{ productId: '', quantity: 1 }],
  };

  it('com a flag desligada (padrão), o pedido nasce PENDING e sem acceptedAt', async () => {
    await autoAcceptService.update(restaurantId, { enabled: false });
    const order = await orderService.openPublic(restaurantId, { ...baseInput, items: [{ productId, quantity: 1 }] });
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.acceptedAt).toBeNull();
  });

  it('com a flag ligada, o pedido nasce OPEN e já com acceptedAt preenchido', async () => {
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, { ...baseInput, items: [{ productId, quantity: 1 }] });
    expect(order.status).toBe(OrderStatus.OPEN);
    expect(order.acceptedAt).not.toBeNull();
  });

  it('autoAcceptService.get() reflete o valor salvo', async () => {
    await autoAcceptService.update(restaurantId, { enabled: true });
    await expect(autoAcceptService.get(restaurantId)).resolves.toEqual({ enabled: true });
    await autoAcceptService.update(restaurantId, { enabled: false });
    await expect(autoAcceptService.get(restaurantId)).resolves.toEqual({ enabled: false });
  });
});
