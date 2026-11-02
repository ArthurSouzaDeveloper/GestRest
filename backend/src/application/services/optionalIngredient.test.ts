import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderType, PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ingredientService, productService } from './catalog.service';
import { mergeIdenticalItems, renderTicket } from './escpos.helpers';
import { orderService } from './order.service';
import { publicOrderService } from './publicOrder.service';

/**
 * Insumo "dá pra tirar" (ex.: Milho no Especial da Casa): em falta, o pastel continua à
 * venda, o cardápio avisa e o item do pedido guarda "sem milho" pra impressão.
 */
describe('insumo que dá pra tirar', () => {
  let restaurantId: string;
  let slug: string;
  let especial: string;
  let milhoId: string;

  beforeAll(async () => {
    slug = `teste-opcional-${randomUUID()}`;
    restaurantId = (await prisma.restaurant.create({ data: { name: 'Teste Opcional', slug } })).id;
    const cat = await prisma.category.create({ data: { name: 'Sugestões da Casa', station: Station.KITCHEN, restaurantId } });
    especial = (await prisma.product.create({ data: { name: 'Especial da Casa', price: 20, categoryId: cat.id, restaurantId } })).id;
    milhoId = (await ingredientService.create(restaurantId, { name: 'Milho', optionalProductIds: [especial] })).id;
  });

  afterAll(async () => {
    await prisma.orderItemAdditional.deleteMany({ where: { orderItem: { order: { restaurantId } } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.printJob.deleteMany({ where: { restaurantId } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.customer.deleteMany({ where: { restaurantId } });
    await prisma.ingredient.deleteMany({ where: { restaurantId } });
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.category.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  const order = () =>
    orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Fulano Milho',
      customerPhone: '19991114444',
      customerCpf: '10000014826',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: especial, quantity: 1 }],
    });
  const lastItem = () =>
    prisma.orderItem.findFirstOrThrow({ where: { order: { restaurantId } }, orderBy: { createdAt: 'desc' } });

  it('guarda o vínculo como "dá pra tirar"', async () => {
    const [ing] = await ingredientService.list(restaurantId);
    expect(ing.optionalProductIds).toEqual([especial]);
    expect(ing.productIds).toEqual([]);
  });

  it('com milho, o pedido sai normal', async () => {
    await order();
    expect((await lastItem()).removedIngredients).toEqual([]);
  });

  it('sem milho, o pastel continua no cardápio com o aviso e o pedido guarda "sem milho"', async () => {
    await ingredientService.update(restaurantId, milhoId, { inStock: false });
    const menu = await publicOrderService.products(slug);
    const p = menu.find((x) => x.id === especial)!;
    expect(p).toBeDefined();
    expect(p.missingIngredients).toEqual(['Milho']);
    expect((await productService.list(restaurantId))[0].soldOutIngredients).toEqual([]);

    await order();
    expect((await lastItem()).removedIngredients).toEqual(['Milho']);
  });

  it('marcado nas duas listas, fica só como essencial', async () => {
    const ing = await ingredientService.update(restaurantId, milhoId, {
      productIds: [especial],
      optionalProductIds: [especial],
    });
    expect(ing.productIds).toEqual([especial]);
    expect(ing.optionalProductIds).toEqual([]);
    await ingredientService.update(restaurantId, milhoId, { productIds: [], optionalProductIds: [especial], inStock: true });
  });
});

describe('impressão com insumo tirado', () => {
  const ticket = (items: Parameters<typeof renderTicket>[0]['items']) =>
    renderTicket({
      station: Station.KITCHEN,
      tableNumber: null,
      orderType: OrderType.PICKUP,
      orderNumber: 7,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      placedAt: new Date('2026-11-02T22:00:00Z'),
      items,
    }).toString('latin1');

  it('mostra SEM MILHO embaixo do pastel', () => {
    const text = ticket([
      { name: 'Especial da Casa', description: null, quantity: 1, additionals: [], removedIngredients: ['Milho'] },
    ]);
    expect(text).toContain('SEM MILHO');
  });

  it('não junta o pastel sem milho com o que tem milho', () => {
    const merged = mergeIdenticalItems([
      { name: 'Especial da Casa', description: null, quantity: 1, additionals: [] },
      { name: 'Especial da Casa', description: null, quantity: 1, additionals: [], removedIngredients: ['Milho'] },
    ]);
    expect(merged).toHaveLength(2);
  });
});
