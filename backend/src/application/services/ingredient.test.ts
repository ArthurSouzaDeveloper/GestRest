import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdditionalKind, PaymentMethod, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ingredientService, productService } from './catalog.service';
import { orderService } from './order.service';
import { publicOrderService } from './publicOrder.service';

/**
 * Insumo em falta (ex.: acabou a laranja): tudo que leva o insumo (sucos na base Laranja,
 * Suco de Laranja, sabor do Monte o Seu) sai do cardápio e é recusado no pedido. Ao voltar,
 * só volta o que não estava esgotado por conta própria.
 */
describe('insumo em falta', () => {
  let restaurantId: string;
  let slug: string;
  let morangoLaranja: string;
  let morangoAgua: string;
  let uvaLaranja: string;
  let sucoLaranja: string;
  let customId: string;
  let baseLaranja: string;
  let baseCarne: string;
  let laranjaId: string;

  beforeAll(async () => {
    slug = `teste-insumo-${randomUUID()}`;
    restaurantId = (await prisma.restaurant.create({ data: { name: 'Teste Insumo', slug } })).id;
    const sucos = await prisma.category.create({ data: { name: 'Sucos', station: Station.JUICE_BAR, restaurantId } });
    const pasteis = await prisma.category.create({ data: { name: 'Pastéis', station: Station.KITCHEN, restaurantId } });
    const product = async (name: string, available = true) =>
      (await prisma.product.create({ data: { name, price: 14, available, categoryId: sucos.id, restaurantId } })).id;
    morangoLaranja = await product('Morango (Laranja)');
    morangoAgua = await product('Morango (Água)');
    // Já esgotado por conta própria antes de a laranja acabar.
    uvaLaranja = await product('Uva (Laranja)', false);
    sucoLaranja = await product('Suco de Laranja');
    customId = (
      await prisma.product.create({
        data: { name: 'Monte o Seu', price: 0, isCustom: true, categoryId: pasteis.id, restaurantId },
      })
    ).id;
    const base = async (name: string) =>
      (
        await prisma.additional.create({
          data: { name, price: 10, kind: AdditionalKind.BASE, categoryId: pasteis.id, restaurantId },
        })
      ).id;
    baseLaranja = await base('Laranja');
    baseCarne = await base('Carne');

    laranjaId = (
      await ingredientService.create(restaurantId, {
        name: 'Laranja',
        productIds: [morangoLaranja, uvaLaranja, sucoLaranja],
        additionalIds: [baseLaranja],
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.orderItemAdditional.deleteMany({ where: { orderItem: { order: { restaurantId } } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.printJob.deleteMany({ where: { restaurantId } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.customer.deleteMany({ where: { restaurantId } });
    await prisma.ingredient.deleteMany({ where: { restaurantId } });
    await prisma.additional.deleteMany({ where: { restaurantId } });
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.category.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  const order = (items: { productId: string; additionalIds?: string[]; comboProductIds?: string[] }[]) =>
    orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Fulano Insumo',
      customerPhone: '19991113333',
      customerCpf: '10000014826',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: items.map((i) => ({ quantity: 1, ...i })),
    });
  const menuNames = async () => (await publicOrderService.products(slug)).map((p) => p.name);
  const additionalNames = async () => (await publicOrderService.additionals(slug)).map((a) => a.name);

  it('com laranja em estoque, tudo que não foi esgotado aparece', async () => {
    expect(await menuNames()).toEqual(expect.arrayContaining(['Morango (Laranja)', 'Morango (Água)', 'Suco de Laranja']));
    expect(await menuNames()).not.toContain('Uva (Laranja)');
    expect(await additionalNames()).toContain('Laranja');
  });

  it('laranja em falta tira do cardápio tudo que leva laranja', async () => {
    await ingredientService.update(restaurantId, laranjaId, { inStock: false });
    const names = await menuNames();
    expect(names).toContain('Morango (Água)');
    expect(names).not.toContain('Morango (Laranja)');
    expect(names).not.toContain('Suco de Laranja');
    expect(await additionalNames()).toEqual(['Carne']);

    // Lista do admin mostra o motivo sem mexer no "available" próprio do produto.
    const admin = await productService.list(restaurantId);
    const ml = admin.find((p) => p.id === morangoLaranja)!;
    expect(ml.available).toBe(true);
    expect(ml.soldOutIngredients).toEqual(['Laranja']);
  });

  it('pedido com item que leva laranja é recusado com o motivo', async () => {
    await expect(order([{ productId: sucoLaranja }])).rejects.toThrow('Esgotado no momento: Suco de Laranja (sem Laranja)');
    await expect(order([{ productId: customId, additionalIds: [baseLaranja] }])).rejects.toThrow(
      'Esgotado no momento: Laranja',
    );
    await expect(
      order([{ productId: morangoAgua, comboProductIds: [morangoAgua, morangoLaranja] }]),
    ).rejects.toThrow('sem Laranja');
    await expect(order([{ productId: morangoAgua }, { productId: customId, additionalIds: [baseCarne] }])).resolves.toBeDefined();
  });

  it('laranja de volta devolve tudo, menos o que já estava esgotado por conta própria', async () => {
    await ingredientService.update(restaurantId, laranjaId, { inStock: true });
    const names = await menuNames();
    expect(names).toEqual(expect.arrayContaining(['Morango (Laranja)', 'Suco de Laranja']));
    expect(names).not.toContain('Uva (Laranja)');
    expect(await additionalNames()).toContain('Laranja');
    await expect(order([{ productId: sucoLaranja }])).resolves.toBeDefined();
  });

  it('não liga produto de outro restaurante nem duplica o nome', async () => {
    const other = await prisma.restaurant.create({ data: { name: 'Outro', slug: `outro-${randomUUID()}` } });
    try {
      const cat = await prisma.category.create({ data: { name: 'X', restaurantId: other.id } });
      const foreign = await prisma.product.create({
        data: { name: 'Alheio', price: 1, categoryId: cat.id, restaurantId: other.id },
      });
      await expect(ingredientService.update(restaurantId, laranjaId, { productIds: [foreign.id] })).rejects.toThrow();
      await expect(ingredientService.create(restaurantId, { name: 'laranja' })).rejects.toThrow('Já existe');
    } finally {
      await prisma.product.deleteMany({ where: { restaurantId: other.id } });
      await prisma.category.deleteMany({ where: { restaurantId: other.id } });
      await prisma.restaurant.delete({ where: { id: other.id } });
    }
  });
});
