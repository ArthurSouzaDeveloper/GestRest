import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { productService } from './catalog.service';

/**
 * Destaque do dono: produto marcado sobe pro topo da própria categoria, e entre vários
 * destaques vale a ordem em que foram marcados (não o alfabeto).
 */
describe('produto em destaque', () => {
  let tenantId: string;
  let categoryId: string;

  beforeAll(async () => {
    const r = await prisma.restaurant.create({
      data: { name: 'Teste Destaque', slug: `teste-destaque-${Date.now()}` },
    });
    tenantId = r.id;
    const c = await prisma.category.create({
      data: { name: 'Pastéis Doces', station: Station.KITCHEN, restaurantId: tenantId },
    });
    categoryId = c.id;
    for (const name of ['Abacaxi', 'Banana', 'Chocotone']) {
      await prisma.product.create({ data: { name, price: 10, categoryId, restaurantId: tenantId } });
    }
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { restaurantId: tenantId } });
    await prisma.category.deleteMany({ where: { restaurantId: tenantId } });
    await prisma.restaurant.delete({ where: { id: tenantId } });
  });

  const names = async () => (await productService.list(tenantId, { categoryId })).map((p) => p.name);

  it('sem destaque, segue o alfabeto', async () => {
    expect(await names()).toEqual(['Abacaxi', 'Banana', 'Chocotone']);
  });

  it('destaque sobe pro topo, e vários destaques saem na ordem em que foram marcados', async () => {
    const byName = async (name: string) =>
      (await prisma.product.findFirstOrThrow({ where: { restaurantId: tenantId, name } })).id;

    await productService.update(tenantId, await byName('Chocotone'), { featured: true });
    expect(await names()).toEqual(['Chocotone', 'Abacaxi', 'Banana']);

    await new Promise((r) => setTimeout(r, 5));
    await productService.update(tenantId, await byName('Banana'), { featured: true });
    expect(await names()).toEqual(['Chocotone', 'Banana', 'Abacaxi']);

    // Mexer em outro campo não pode reordenar os destaques.
    await productService.update(tenantId, await byName('Chocotone'), { price: 17.5 });
    expect(await names()).toEqual(['Chocotone', 'Banana', 'Abacaxi']);

    // Desmarcar devolve o produto pra ordem normal.
    await productService.update(tenantId, await byName('Chocotone'), { featured: false });
    expect(await names()).toEqual(['Banana', 'Abacaxi', 'Chocotone']);
  });
});
