import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdditionalKind, PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { publicOrderService } from './publicOrder.service';

/**
 * Sabor/adicional esgotado (active=false, ex.: acabou o pernil): some do cardápio público
 * e o pedido que ainda o traz (carrinho montado antes) é recusado com o nome do item, em
 * vez de o adicional sumir calado ou dar o confuso "Escolha o sabor-base".
 */
describe('sabor/adicional esgotado', () => {
  let restaurantId: string;
  let slug: string;
  let customId: string;
  let pernilId: string;
  let carneId: string;
  let catupiryId: string;

  beforeAll(async () => {
    slug = `teste-esgotado-${randomUUID()}`;
    restaurantId = (await prisma.restaurant.create({ data: { name: 'Teste Esgotado', slug } })).id;
    const category = await prisma.category.create({
      data: { name: 'Pastéis', station: Station.KITCHEN, restaurantId },
    });
    customId = (
      await prisma.product.create({
        data: { name: 'Monte o Seu Pastel', price: 0, isCustom: true, categoryId: category.id, restaurantId },
      })
    ).id;
    const base = (name: string, active = true) =>
      prisma.additional.create({
        data: { name, price: 14.5, kind: AdditionalKind.BASE, active, categoryId: category.id, restaurantId },
      });
    pernilId = (await base('Pernil', false)).id;
    carneId = (await base('Carne')).id;
    catupiryId = (
      await prisma.additional.create({
        data: { name: 'Catupiry', price: 3, active: false, categoryId: category.id, restaurantId },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.orderItemAdditional.deleteMany({ where: { orderItem: { order: { restaurantId } } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.customer.deleteMany({ where: { restaurantId } });
    await prisma.additional.deleteMany({ where: { restaurantId } });
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  const order = (additionalIds: string[]) =>
    orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Fulano Esgotado',
      customerPhone: '19991112222',
      customerCpf: '10000014826',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: customId, quantity: 1, additionalIds }],
    });

  it('cardápio público não lista o sabor esgotado', async () => {
    const names = (await publicOrderService.additionals(slug)).map((a) => a.name);
    expect(names).toContain('Carne');
    expect(names).not.toContain('Pernil');
  });

  it('pedido com sabor-base esgotado é recusado pelo nome', async () => {
    await expect(order([pernilId])).rejects.toThrow('Esgotado no momento: Pernil');
  });

  it('pedido com adicional comum esgotado é recusado pelo nome', async () => {
    await expect(order([carneId, catupiryId])).rejects.toThrow('Esgotado no momento: Catupiry');
  });

  it('sabor disponível continua passando', async () => {
    await expect(order([carneId])).resolves.toBeDefined();
  });
});
