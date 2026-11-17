import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ingredientService, productService } from './catalog.service';

/**
 * Ingredientes direto no cadastro do produto: o admin digita o nome, o insumo é criado (ou
 * reaproveitado) e o produto fica ligado como "some do cardápio" ou "dá pra tirar".
 */
describe('ingredientes do produto', () => {
  let restaurantId: string;
  let categoryId: string;

  beforeAll(async () => {
    restaurantId = (await prisma.restaurant.create({ data: { name: 'Teste Ingred', slug: `teste-ingred-${randomUUID()}` } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'Pastéis', station: Station.KITCHEN, restaurantId } })).id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { restaurantId } });
    await prisma.ingredient.deleteMany({ where: { restaurantId } });
    await prisma.category.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
    await prisma.$disconnect();
  });

  const byName = async () => {
    const all = await ingredientService.list(restaurantId);
    return Object.fromEntries(all.map((i) => [i.name, i]));
  };

  it('cria o produto já com ingredientes e reaproveita insumo existente sem mexer no estoque', async () => {
    const milho = await ingredientService.create(restaurantId, { name: 'Milho', inStock: false });
    const caipira = await productService.create(restaurantId, {
      name: 'Caipira',
      price: 19,
      categoryId,
      ingredients: [{ name: 'milho', optional: true }, { name: 'Frango' }, { name: 'frango' }],
    });
    const all = await byName();
    // "milho" (minúsculo) achou o Milho que já existia, sem criar outro e sem voltar ao estoque.
    expect(Object.keys(all).sort()).toEqual(['Frango', 'Milho']);
    expect(all.Milho.id).toBe(milho.id);
    expect(all.Milho.inStock).toBe(false);
    expect(all.Milho.optionalProductIds).toEqual([caipira.id]);
    expect(all.Frango.productIds).toEqual([caipira.id]);
  });

  it('atualiza: lista substitui os vínculos, ausente não mexe, vazia solta tudo', async () => {
    const p = await productService.create(restaurantId, {
      name: 'Hot Dog',
      price: 17,
      categoryId,
      ingredients: [{ name: 'Salsicha' }, { name: 'Ervilha', optional: true }],
    });

    await productService.update(restaurantId, p.id, { price: 18 });
    let all = await byName();
    expect(all.Salsicha.productIds).toEqual([p.id]);
    expect(all.Ervilha.optionalProductIds).toEqual([p.id]);

    // Ervilha passa de "dá pra tirar" pra "some", Salsicha sai da lista.
    await productService.update(restaurantId, p.id, { ingredients: [{ name: 'Ervilha' }] });
    all = await byName();
    expect(all.Ervilha.productIds).toEqual([p.id]);
    expect(all.Ervilha.optionalProductIds).toEqual([]);
    expect(all.Salsicha.productIds).toEqual([]);
    // O insumo continua cadastrado, só desligou do produto.
    expect(all.Salsicha).toBeDefined();

    await productService.update(restaurantId, p.id, { ingredients: [] });
    all = await byName();
    expect(all.Ervilha.productIds).toEqual([]);
  });
});
