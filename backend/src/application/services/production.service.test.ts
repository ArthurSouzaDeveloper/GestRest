import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { productionService } from './production.service';

/**
 * A fila de produção precisa devolver a categoria do produto (ex.: "Pastéis Salgados",
 * "Mini Pizza Salgada") pra tela distinguir sabores que existem em mais de uma
 * categoria — mesma necessidade do ticket impresso, ver escpos.helpers.test.ts.
 */
describe('fila de produção (productionService.queue)', () => {
  let restaurantId: string;
  let pastelCategoryId: string;
  let miniPizzaCategoryId: string;
  let waiterId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Produção', slug: `teste-producao-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    pastelCategoryId = (
      await prisma.category.create({ data: { name: 'Pastéis Salgados', station: Station.KITCHEN, restaurantId } })
    ).id;
    miniPizzaCategoryId = (
      await prisma.category.create({ data: { name: 'Mini Pizza Salgada', station: Station.KITCHEN, restaurantId } })
    ).id;
    waiterId = (
      await prisma.user.create({
        data: { name: 'Garçom', email: `garcom-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.WAITER, restaurantId },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('devolve a categoria de cada item pra diferenciar sabor repetido entre pastel e mini pizza', async () => {
    const pastelProductId = (
      await prisma.product.create({
        data: { name: 'Mussarela', price: 12, categoryId: pastelCategoryId, restaurantId },
      })
    ).id;
    const miniPizzaProductId = (
      await prisma.product.create({
        data: { name: 'Mussarela', price: 14, categoryId: miniPizzaCategoryId, restaurantId },
      })
    ).id;
    const table = await prisma.restaurantTable.create({ data: { number: 601, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: pastelProductId, quantity: 1 }, { productId: miniPizzaProductId, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const queue = await productionService.queue(restaurantId, Station.KITCHEN);
    const byCategory = new Map(queue.map((t) => [t.category, t.productName]));
    expect(byCategory.get('Pastéis Salgados')).toBe('Mussarela');
    expect(byCategory.get('Mini Pizza Salgada')).toBe('Mussarela');
  });
});
