import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError } from '../../utils/errors';
import { tableService } from './table.service';
import { additionalService, categoryService, ingredientService, productService } from './catalog.service';

/**
 * Testes de integração (banco real) para a correção da auditoria QA: apagar uma mesa ou
 * uma categoria/produto que já tem pedidos no histórico (inclusive pagos) não pode mais
 * apagar esse histórico junto. O schema trocou `onDelete: Cascade` por `Restrict` nessas
 * relações; os services fazem uma checagem antes, pra devolver ConflictError com mensagem
 * clara em vez do erro cru de constraint do Postgres.
 */
describe('integridade de dados — remoção de mesa/categoria/produto com histórico', () => {
  let restaurantId: string;
  let userId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Integridade', slug: `teste-integridade-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const user = await prisma.user.create({
      data: {
        name: 'Usuário Teste',
        email: `teste-integridade-${randomUUID()}@teste.local`,
        passwordHash: 'x',
        role: Role.WAITER,
        restaurantId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // Mesma ordem usada por superadminService.removeRestaurant(): com Restrict em vez de
    // Cascade nessas relações, o restaurante só pode ser apagado depois que pedidos/itens
    // criados nos testes acima (deixados de propósito, pra provar que sobrevivem) forem
    // limpos manualmente primeiro.
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('mesa sem pedidos pode ser removida normalmente', async () => {
    const table = await prisma.restaurantTable.create({
      data: { number: 901, restaurantId },
    });
    await expect(tableService.remove(restaurantId, table.id)).resolves.toBeDefined();
    await expect(prisma.restaurantTable.findUnique({ where: { id: table.id } })).resolves.toBeNull();
  });

  it('mesa com pedido pago não pode ser removida, e o pedido sobrevive', async () => {
    const table = await prisma.restaurantTable.create({
      data: { number: 902, restaurantId },
    });
    const order = await prisma.order.create({
      data: { restaurantId, tableId: table.id, waiterId: userId, status: OrderStatus.PAID },
    });

    await expect(tableService.remove(restaurantId, table.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(prisma.order.findUnique({ where: { id: order.id } })).resolves.not.toBeNull();
    await expect(prisma.restaurantTable.findUnique({ where: { id: table.id } })).resolves.not.toBeNull();
  });

  it('categoria vazia pode ser removida normalmente', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Vazia ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    await expect(categoryService.remove(restaurantId, category.id)).resolves.toBeDefined();
  });

  it('categoria com produto vinculado não pode ser removida', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Com Produto ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    await prisma.product.create({
      data: { name: 'Produto', price: 10, categoryId: category.id, restaurantId },
    });

    await expect(categoryService.remove(restaurantId, category.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('produto usado em pedido pago é arquivado (some do painel), e o item do pedido sobrevive', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Produto Pago ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Produto Vendido', price: 10, categoryId: category.id, restaurantId },
    });
    const order = await prisma.order.create({
      data: { restaurantId, waiterId: userId, status: OrderStatus.PAID },
    });
    const item = await prisma.orderItem.create({
      data: { orderId: order.id, productId: product.id, unitPrice: 10 },
    });

    const ingredient = await ingredientService.create(restaurantId, {
      name: `Insumo ${randomUUID()}`,
      productIds: [product.id],
    });

    await expect(productService.remove(restaurantId, product.id)).resolves.toEqual({ archived: true });
    await expect(prisma.orderItem.findUnique({ where: { id: item.id } })).resolves.not.toBeNull();
    const archived = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(archived.deletedAt).not.toBeNull();
    expect(archived.available).toBe(false);
    const list = await productService.list(restaurantId);
    expect(list.find((p) => p.id === product.id)).toBeUndefined();
    const ingredients = await ingredientService.list(restaurantId);
    expect(ingredients.find((i) => i.id === ingredient.id)?.productIds).toEqual([]);
    // Editar/excluir de novo um produto arquivado dá "não encontrado".
    await expect(productService.update(restaurantId, product.id, { available: true })).rejects.toThrow();
  });

  it('produto nunca vendido é apagado de vez', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Produto Novo ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Produto Errado', price: 10, categoryId: category.id, restaurantId },
    });
    await expect(productService.remove(restaurantId, product.id)).resolves.toEqual({ archived: false });
    await expect(prisma.product.findUnique({ where: { id: product.id } })).resolves.toBeNull();
  });

  it('adicional usado em pedido é arquivado; adicional nunca usado é apagado', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Adicional ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Açaí', price: 10, categoryId: category.id, restaurantId },
    });
    const used = await additionalService.create(restaurantId, { name: 'Bombom', price: 2, categoryId: category.id });
    const unused = await additionalService.create(restaurantId, { name: 'Bombom errado', price: 2 });
    const order = await prisma.order.create({ data: { restaurantId, waiterId: userId, status: OrderStatus.PAID } });
    const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, unitPrice: 12 } });
    await prisma.orderItemAdditional.create({
      data: { orderItemId: item.id, additionalId: used.id, name: 'Bombom', price: 2 },
    });

    await expect(additionalService.remove(restaurantId, used.id)).resolves.toEqual({ archived: true });
    await expect(additionalService.remove(restaurantId, unused.id)).resolves.toEqual({ archived: false });
    const list = await additionalService.list(restaurantId);
    expect(list.map((a) => a.id)).not.toContain(used.id);
    expect(list.map((a) => a.id)).not.toContain(unused.id);
    const archived = await prisma.additional.findUniqueOrThrow({ where: { id: used.id } });
    expect(archived.active).toBe(false);
  });
});
