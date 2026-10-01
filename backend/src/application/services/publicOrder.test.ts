import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { publicOrderService } from './publicOrder.service';

/**
 * Testes de integração (banco real) pros endereços de entrega salvos por telefone — pedido
 * explícito do cliente/dono: quem já pediu entrega vê os endereços de antes (casa,
 * trabalho...) pra escolher no pedido seguinte em vez de redigitar. Ver CustomerAddress no
 * schema, order.service.ts#openPublic (grava/atualiza) e
 * publicOrder.service.ts#customerLogin (devolve a lista).
 */
describe('endereços de entrega salvos pro próximo pedido (CustomerAddress)', () => {
  let restaurantId: string;
  let slug: string;
  let productId: string;
  let zoneId: string;

  beforeAll(async () => {
    slug = `teste-enderecos-salvos-${randomUUID()}`;
    const restaurant = await prisma.restaurant.create({ data: { name: 'Teste Endereços Salvos', slug } });
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

  it('pedido de entrega grava o endereço, e customerLogin devolve na lista de endereços salvos', async () => {
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
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toMatchObject({
      zoneId,
      street: 'Rua das Flores',
      number: '100',
      complement: 'Fundos',
      cep: '13470-000',
      lat: null,
      lng: null,
    });
  });

  it('pedido de entrega pra um endereço DIFERENTE soma à lista — não sobrescreve o anterior', async () => {
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Beltrano Souza',
      customerPhone: '19993334444',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua de Casa',
      deliveryNumber: '1',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Beltrano Souza',
      customerPhone: '19993334444',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua do Trabalho',
      deliveryNumber: '2',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

    const result = await publicOrderService.customerLogin(slug, 'Beltrano Souza', '19993334444');
    expect(result.addresses).toHaveLength(2);
    // Mais recente primeiro.
    expect(result.addresses[0].street).toBe('Rua do Trabalho');
    expect(result.addresses[1].street).toBe('Rua de Casa');
  });

  it('um segundo pedido pro MESMO endereço (rua+número) atualiza no lugar — não duplica', async () => {
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Ciclano Pereira',
      customerPhone: '19997778888',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua Repetida',
      deliveryNumber: '5',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });
    await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Ciclano Pereira',
      customerPhone: '19997778888',
      deliveryZoneId: zoneId,
      deliveryStreet: 'Rua Repetida',
      deliveryNumber: '5',
      deliveryComplement: 'Casa 2', // detalhe novo no mesmo endereço — deve atualizar, não duplicar
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId, quantity: 1 }],
    });

    const result = await publicOrderService.customerLogin(slug, 'Ciclano Pereira', '19997778888');
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].complement).toBe('Casa 2');
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
    expect(result.addresses).toEqual([]);
  });

  it('nome que não bate com o telefone não reconhece (e não vaza o endereço de outra pessoa)', async () => {
    const result = await publicOrderService.customerLogin(slug, 'Nome Errado', '19991112222');
    expect(result).toEqual({ name: null, orders: [], addresses: [] });
  });
});
