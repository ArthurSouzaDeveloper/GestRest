import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError } from '../../utils/errors';
import { tableService } from './table.service';
import { additionalService, categoryService, productService } from './catalog.service';

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

  it('produto usado em pedido pago é arquivado (some das listas), e o item do pedido sobrevive', async () => {
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

    await expect(productService.remove(restaurantId, product.id)).resolves.toEqual({ archived: true });
    await expect(prisma.orderItem.findUnique({ where: { id: item.id } })).resolves.not.toBeNull();
    const row = await prisma.product.findUnique({ where: { id: product.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.available).toBe(false);
    const listed = await productService.list(restaurantId);
    expect(listed.some((p) => p.id === product.id)).toBe(false);
  });

  it('produto nunca vendido é apagado de verdade', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Produto Novo ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Produto Errado', price: 10, categoryId: category.id, restaurantId },
    });
    await expect(productService.remove(restaurantId, product.id)).resolves.toEqual({ archived: false });
    await expect(prisma.product.findUnique({ where: { id: product.id } })).resolves.toBeNull();
  });

  it('adicional usado em pedido é arquivado; nunca usado é apagado', async () => {
    const category = await prisma.category.create({
      data: { name: `Categoria Adicional ${randomUUID()}`, station: Station.NONE, restaurantId },
    });
    const product = await prisma.product.create({
      data: { name: 'Açaí Teste', price: 16, categoryId: category.id, restaurantId },
    });
    const used = await additionalService.create(restaurantId, { name: 'Bombom', price: 4, categoryId: category.id });
    const fresh = await additionalService.create(restaurantId, { name: 'Bombom Errado', price: 4, categoryId: category.id });
    const order = await prisma.order.create({ data: { restaurantId, waiterId: userId, status: OrderStatus.PAID } });
    const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, unitPrice: 20 } });
    await prisma.orderItemAdditional.create({ data: { orderItemId: item.id, additionalId: used.id, name: 'Bombom', price: 4 } });

    await expect(additionalService.remove(restaurantId, used.id)).resolves.toEqual({ archived: true });
    await expect(additionalService.remove(restaurantId, fresh.id)).resolves.toEqual({ archived: false });
    const listed = await additionalService.list(restaurantId, { categoryId: category.id });
    expect(listed).toHaveLength(0);
    const row = await prisma.additional.findUnique({ where: { id: used.id } });
    expect(row?.active).toBe(false);
    await prisma.orderItemAdditional.deleteMany({ where: { orderItemId: item.id } });
  });
});
