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

  it('imprime a descrição do produto e nunca a categoria', async () => {
    const category = await prisma.category.findFirstOrThrow({ where: { restaurantId, station: Station.KITCHEN } });
    const productWithDescription = await prisma.product.create({
      data: {
        name: 'Frango Premium',
        description: 'Frango, geleia de pimenta, bacon, queijo e cream cheese.',
        price: 22,
        categoryId: category.id,
        restaurantId,
      },
    });
    const table = await prisma.restaurantTable.create({ data: { number: 503, restaurantId } });
    const order = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      order!.id,
      [{ productId: productWithDescription.id, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order!.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('1x Frango Premium');
    expect(text).toContain('Frango, geleia de pimenta, bacon, queijo e cream cheese.');
    // Sem colchetes de categoria em lugar nenhum do ticket (ver renderTicket).
    expect(text).not.toContain('[');
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
    // Só entrega sai em 2 vias — retirada (como este teste) sai em 1 via só. Ver teste
    // dedicado abaixo pra checar o conteúdo da 2a via de entrega especificamente.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs.every((j) => j.station === Station.KITCHEN)).toBe(true);
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

    // Retirada (PICKUP) sai em 1 via só — 2a via é exclusiva de entrega.
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs.every((j) => j.station === Station.JUICE_BAR)).toBe(true);
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

  it('pedido de entrega gera ticket com telefone e endereço completo do cliente', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Centro - Americana', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const order = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente Entrega',
      customerPhone: '11999990003',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua das Laranjeiras',
      deliveryNumber: '123',
      deliveryComplement: 'Apto 4',
      deliveryCep: '13470-000',
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id } });
    const text = job.payload.toString('ascii');
    expect(text).toContain('Tel: 11999990003');
    expect(text).toContain('Rua das Laranjeiras, 123 - Apto 4');
    expect(text).toContain('Centro - Americana');
    expect(text).toContain('CEP: 13470-000');
    expect(text).toContain('R$ 10,00 / un.');
  });

  it('só entrega sai em 2 vias (a segunda marcada); retirada e mesa saem em 1 via só', async () => {
    const zone = await prisma.deliveryZone.create({
      data: { name: 'Zona 2 Vias', fee: 5, restaurantId },
    });
    await autoAcceptService.update(restaurantId, { enabled: true });
    const delivery = await orderService.openPublic(restaurantId, {
      orderType: 'DELIVERY',
      customerName: 'Cliente 2 Vias',
      customerPhone: '11999990004',
      declaredPaymentMethod: PaymentMethod.CASH,
      deliveryZoneId: zone.id,
      deliveryStreet: 'Rua Teste',
      deliveryNumber: '1',
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });

    const deliveryJobs = await prisma.printJob.findMany({ where: { orderId: delivery.id } });
    expect(deliveryJobs).toHaveLength(2);
    const texts = deliveryJobs.map((j) => j.payload.toString('ascii'));
    expect(texts.filter((t) => t.includes('2a VIA'))).toHaveLength(1);
    expect(texts.filter((t) => !t.includes('2a VIA'))).toHaveLength(1);

    await autoAcceptService.update(restaurantId, { enabled: true });
    const pickup = await orderService.openPublic(restaurantId, {
      orderType: 'PICKUP',
      customerName: 'Cliente Retirada',
      customerPhone: '11999990005',
      declaredPaymentMethod: PaymentMethod.CASH,
      items: [{ productId: kitchenProductId, quantity: 1 }],
    });
    await autoAcceptService.update(restaurantId, { enabled: false });
    const pickupJobs = await prisma.printJob.findMany({ where: { orderId: pickup.id } });
    expect(pickupJobs).toHaveLength(1);
    expect(pickupJobs[0].payload.toString('ascii')).not.toContain('2a VIA');

    const table = await prisma.restaurantTable.create({ data: { number: 502, restaurantId } });
    const dineIn = await orderService.open({ tableId: table.id }, { userId: waiterId, tenantId: restaurantId, role: Role.WAITER });
    await orderService.addItems(
      dineIn!.id,
      [{ productId: kitchenProductId, quantity: 1 }],
      { userId: waiterId, tenantId: restaurantId, role: Role.WAITER },
    );
    const dineInJobs = await prisma.printJob.findMany({ where: { orderId: dineIn!.id } });
    expect(dineInJobs).toHaveLength(1);
    expect(dineInJobs[0].payload.toString('ascii')).not.toContain('2a VIA');
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
