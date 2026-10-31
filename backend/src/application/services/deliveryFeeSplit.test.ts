import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { DELIVERY_FEE_SPLIT_WINDOW_MINUTES, orderService } from './order.service';

/**
 * Testes de integração (banco real) do "pedido dividido" — caso real do cliente/dono: o
 * cliente fez dois pedidos de entrega seguidos (parte no cartão, parte em dinheiro) e pagou a
 * taxa duas vezes. Mesmo cliente (CPF+nome+telefone), mesmo endereço, dentro da janela →
 * só o primeiro paga a taxa. Ver order.service.ts#openPublic.
 */
describe('pedido dividido paga uma taxa de entrega só', () => {
  let restaurantId: string;
  let productId: string;
  let zoneId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Pedido Dividido', slug: `teste-pedido-dividido-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const category = await prisma.category.create({
      data: { name: 'Categoria', station: Station.KITCHEN, restaurantId },
    });
    productId = (
      await prisma.product.create({ data: { name: 'Produto', price: 10, categoryId: category.id, restaurantId } })
    ).id;
    zoneId = (await prisma.deliveryZone.create({ data: { name: 'Centro', fee: 5, restaurantId } })).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.customerAddress.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  const delivery = (over: { name: string; cpf: string; phone: string; street?: string; number?: string; payment?: PaymentMethod }) =>
    orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: over.name,
      customerPhone: over.phone,
      customerCpf: over.cpf,
      deliveryZoneId: zoneId,
      deliveryStreet: over.street ?? 'Rua das Flores',
      deliveryNumber: over.number ?? '100',
      declaredPaymentMethod: over.payment ?? PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

  it('segundo (e terceiro) pedido do mesmo cliente pro mesmo endereço sai sem taxa, apontando pro primeiro', async () => {
    const c = { name: 'Cliente Dividido', cpf: '20000000108', phone: '19991110001' };
    const first = await delivery({ ...c, payment: PaymentMethod.CREDIT });
    // Rua digitada um pouco diferente (maiúscula/espaço) continua sendo o mesmo endereço.
    const second = await delivery({ ...c, street: '  rua das  FLORES ' });
    const third = await delivery(c);

    expect(first.deliveryFee).toBe(5);
    expect(first.deliveryFeeWaivedByOrderNumber).toBeNull();
    expect(second.deliveryFee).toBe(0);
    expect(second.totals.total).toBe(10);
    expect(second.deliveryFeeWaivedByOrderNumber).toBe(first.number);
    expect(third.deliveryFee).toBe(0);
    expect(third.deliveryFeeWaivedByOrderNumber).toBe(first.number);
  });

  it('endereço diferente cobra a taxa de novo (é outra viagem)', async () => {
    const c = { name: 'Cliente Dois Enderecos', cpf: '20000000299', phone: '19991110002' };
    await delivery(c);
    const other = await delivery({ ...c, number: '200' });
    expect(other.deliveryFee).toBe(5);
    expect(other.deliveryFeeWaivedByOrderNumber).toBeNull();
  });

  it('telefone diferente cobra a taxa de novo', async () => {
    const c = { name: 'Cliente Trocou Telefone', cpf: '20000000370', phone: '19991110003' };
    await delivery(c);
    const other = await delivery({ ...c, phone: '19991119999' });
    expect(other.deliveryFee).toBe(5);
  });

  it('outra pessoa (outro CPF) no mesmo endereço cobra a taxa', async () => {
    await delivery({ name: 'Vizinho Um', cpf: '20000000450', phone: '19991110004', street: 'Rua Vizinha' });
    const other = await delivery({ name: 'Vizinho Dois', cpf: '20000000531', phone: '19991110004', street: 'Rua Vizinha' });
    expect(other.deliveryFee).toBe(5);
  });

  it('pedido anterior cancelado não conta', async () => {
    const c = { name: 'Cliente Cancelou', cpf: '20000000612', phone: '19991110006' };
    const first = await delivery(c);
    await prisma.order.update({ where: { id: first.id }, data: { status: OrderStatus.CANCELLED } });
    const second = await delivery(c);
    expect(second.deliveryFee).toBe(5);
  });

  it(`fora da janela de ${DELIVERY_FEE_SPLIT_WINDOW_MINUTES} minutos cobra a taxa de novo`, async () => {
    const c = { name: 'Cliente Demorou', cpf: '20000000701', phone: '19991110007' };
    const first = await delivery(c);
    await prisma.order.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - (DELIVERY_FEE_SPLIT_WINDOW_MINUTES + 1) * 60_000) },
    });
    const second = await delivery(c);
    expect(second.deliveryFee).toBe(5);
  });
});
