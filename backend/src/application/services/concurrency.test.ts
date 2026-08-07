import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ConflictError } from '../../utils/errors';
import { paymentService } from './payment.service';
import { orderService } from './order.service';

/**
 * Testes de integração (banco real — ver services.postgres no CI) para as duas correções
 * de condição de corrida encontradas na auditoria de segurança: pay() podia registrar
 * pagamento em dobro, e o "lock otimista" (campo version) de updateOrder() não travava
 * nada de verdade. Os dois agora usam updateMany com WHERE condicional em vez de um
 * update simples por id — o Postgres serializa as duas escritas concorrentes na mesma
 * linha, e a segunda perde a corrida de forma determinística (não é um teste "instável",
 * é uma garantia de lock de linha do próprio banco).
 */
describe('concorrência — pagamento e edição de pedido', () => {
  let restaurantId: string;
  let userId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Concorrência', slug: `teste-concorrencia-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const user = await prisma.user.create({
      data: {
        name: 'Usuário Teste',
        email: `teste-${randomUUID()}@teste.local`,
        passwordHash: 'x',
        role: Role.CASHIER,
        restaurantId,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('duas chamadas simultâneas de pay() no mesmo pedido: só uma registra pagamento', async () => {
    const order = await prisma.order.create({
      data: { restaurantId, status: OrderStatus.READY_FOR_PAYMENT, serviceRate: 0 },
    });
    const ctx = { userId, tenantId: restaurantId };
    const line = [{ method: PaymentMethod.CASH, amount: 0 }];

    const results = await Promise.allSettled([
      paymentService.pay(order.id, line, ctx),
      paymentService.pay(order.id, line, ctx),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(1);

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe(OrderStatus.PAID);
  });

  it('duas edições simultâneas com a mesma version: só uma aplica, a outra é rejeitada', async () => {
    const order = await prisma.order.create({
      data: { restaurantId, status: OrderStatus.OPEN, version: 0 },
    });
    const ctx = { userId, tenantId: restaurantId, role: Role.CASHIER };

    const results = await Promise.allSettled([
      orderService.updateOrder(order.id, { discount: 5, version: 0 }, ctx),
      orderService.updateOrder(order.id, { discount: 10, version: 0 }, ctx),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.version).toBe(1);
  });
});
