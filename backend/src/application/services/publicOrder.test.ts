import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { publicOrderService } from './publicOrder.service';

/**
 * Testes de integração (banco real) pro endereço de entrega "lembrado" entre pedidos do
 * mesmo cliente (nome+telefone) — pedido explícito do cliente/dono: quem já pediu entrega
 * não precisa redigitar o endereço no pedido seguinte. Ver Customer.lastDeliveryZoneId no
 * schema e order.service.ts#openPublic.
 */
describe('endereço de entrega salvo pro próximo pedido (Customer.lastDelivery*)', () => {
  let restaurantId: string;
  let slug: string;
  let productId: string;
  let zoneId: string;

  beforeAll(async () => {
    slug = `teste-endereco-salvo-${randomUUID()}`;
    const restaurant = await prisma.restaurant.create({ data: { name: 'Teste Endereço Salvo', slug } });
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
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('pedido de entrega grava o endereço no cadastro do cliente, e customerLogin devolve esse endereço', async () => {
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Fulano da Silva',
      customerPhone: '19991112222',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua das Flores',
      deliveryNumber: '100',
      deliveryComplement: 'Fundos',
      deliveryCep: '13470-000',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

    const result = await publicOrderService.customerLogin(slug, 'Fulano da Silva', '19991112222');
    expect(result.name).toBe('Fulano da Silva');
    expect(result.lastDeliveryAddress).toEqual({
      zoneId,
      street: 'Rua das Flores',
      number: '100',
      complement: 'Fundos',
      cep: '13470-000',
      lat: null,
      lng: null,
    });
  });

  it('um segundo pedido de entrega SOBRESCREVE o endereço salvo (não acumula histórico)', async () => {
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Beltrano Souza',
      customerPhone: '19993334444',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua Antiga',
      deliveryNumber: '1',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Beltrano Souza',
      customerPhone: '19993334444',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua Nova',
      deliveryNumber: '2',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

    const result = await publicOrderService.customerLogin(slug, 'Beltrano Souza', '19993334444');
    expect(result.lastDeliveryAddress?.street).toBe('Rua Nova');
    expect(result.lastDeliveryAddress?.number).toBe('2');
  });

  it('cliente que só pediu retirada (nunca entrega) não tem endereço salvo', async () => {
    await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Retirada',
      customerPhone: '19995556666',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

    const result = await publicOrderService.customerLogin(slug, 'Cliente Retirada', '19995556666');
    expect(result.lastDeliveryAddress).toBeNull();
  });

  it('nome que não bate com o telefone não reconhece (e não vaza o endereço de outra pessoa)', async () => {
    const result = await publicOrderService.customerLogin(slug, 'Nome Errado', '19991112222');
    expect(result).toEqual({ name: null, orders: [], lastDeliveryAddress: null });
  });
});
