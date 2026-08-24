import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentMethod, PrintJobStatus, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { orderService } from './order.service';
import { autoAcceptService } from './autoAccept.service';
import { printerSettingsService, verifyAgentKey } from './printerSettings.service';

/**
 * Testes de integração (banco real) para a fila de impressão térmica — item novo em
 * comanda existente, aceite manual e aceite automático cada um gera o PrintJob
 * esperado; e isolamento cross-tenant da chave de acesso da ponte.
 */
describe('fila de impressão térmica (PrintJob)', () => {
  let restaurantId: string;
  let kitchenProductId: string;
  let juiceProductId: string;
  let waiterId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Impressão', slug: `teste-impressao-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const kitchenCategory = await prisma.category.create({
      data: { name: 'Cozinha', station: Station.KITCHEN, restaurantId },
    });
    const juiceCategory = await prisma.category.create({
      data: { name: 'Sucos', station: Station.JUICE_BAR, restaurantId },
    });
    kitchenProductId = (
      await prisma.product.create({ data: { name: 'Pastel', price: 10, categoryId: kitchenCategory.id, restaurantId } })
    ).id;
    juiceProductId = (
      await prisma.product.create({ data: { name: 'Suco', price: 8, categoryId: juiceCategory.id, restaurantId } })
    ).id;
    waiterId = (
      await prisma.user.create({
        data: { name: 'Garçom', email: `garcom-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.WAITER, restaurantId },
      })
    ).id;
  });

  afterAll(async () => {
    // PrintJob é Cascade a partir de Order (de propósito, não é dado financeiro
    // histórico), mas OrderItem->Product continua Restrict (correção da auditoria
    // QA) — precisa limpar itens/pedidos antes do Restaurant, mesmo padrão de
    // dataIntegrity.test.ts.
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId } } });
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('item novo numa comanda existente gera um PrintJob por estação tocada', async () => {
    const table = await prisma.restaurantTable.create({ data: { number: 501, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: kitchenProductId, quantity: 1 }, { productId: juiceProductId, quantity: 2 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const jobs = await prisma.printJob.findMany({ where: { orderId: order!.id } });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.station).sort()).toEqual([Station.JUICE_BAR, Station.KITCHEN].sort());
    for (const job of jobs) {
      expect(job.status).toBe(PrintJobStatus.PENDING);
      expect(job.payload.length).toBeGreaterThan(0);
    }
  });

  it('aceite manual de pedido online gera o PrintJob no momento do aceite, não antes', async () => {
    await autoAcceptService.update(restaurantId, { enabled: false });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente',
      customerPhone: '11999990000',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });

    expect(await prisma.printJob.count({ where: { orderId: order.id } })).toBe(0);

    await orderService.accept(order.id, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].station).toBe(Station.KITCHEN);
  });

  it('aceite automático já gera o PrintJob na criação do pedido', async () => {
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Auto',
      customerPhone: '11999990001',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: juiceProductId, quantity: 1 }],
    });
    expect(order.status).toBe(OrderStatus.OPEN);

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].station).toBe(Station.JUICE_BAR);
    await autoAcceptService.update(restaurantId, { enabled: false });
  });

  it('chave de impressão de um tenant não confirma (ack) job de outro tenant', async () => {
    const otherRestaurant = await prisma.restaurant.create({
      data: { name: 'Outro Restaurante', slug: `outro-${randomUUID()}` },
    });

    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Isolamento',
      customerPhone: '11999990002',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });
    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id } });

    // Mesma checagem que a rota POST /print-agent/jobs/:id/ack faz — updateMany com
    // WHERE restaurantId do dono da chave, não findFirst+update.
    const wrongTenantAck = await prisma.printJob.updateMany({
      where: { id: job.id, restaurantId: otherRestaurant.id, status: PrintJobStatus.PENDING },
      data: { status: PrintJobStatus.PRINTED },
    });
    expect(wrongTenantAck.count).toBe(0);

    const stillPending = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stillPending.status).toBe(PrintJobStatus.PENDING);

    await prisma.restaurant.delete({ where: { id: otherRestaurant.id } });
  });

  it('verifyAgentKey() só valida a chave certa do tenant certo', async () => {
    const { key } = await printerSettingsService.generateAgentKey(restaurantId, { userId: waiterId });

    await expect(verifyAgentKey(key)).resolves.toBe(restaurantId);
    await expect(verifyAgentKey(`${restaurantId}.chave-errada`)).resolves.toBeNull();
    await expect(verifyAgentKey('lixo-sem-formato')).resolves.toBeNull();

    // Regenerar invalida a chave anterior na hora.
    await printerSettingsService.generateAgentKey(restaurantId, { userId: waiterId });
    await expect(verifyAgentKey(key)).resolves.toBeNull();
  });
});
