import { OrderStatus, OrderType, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { paymentService } from './payment.service';

/**
 * Entrega automática de RETIRADA — pedido explícito do cliente: a equipe não deve precisar
 * clicar em "Marcar Entregue" pra cada retirada. Config direto em Restaurant (sem tabela
 * própria), mesmo padrão de etaSettingsService/autoAcceptService. Escrita restrita a
 * Role.ADMIN em catalog.routes.ts, mesmo critério das outras configurações operacionais.
 *
 * Importante: isso NUNCA se aplica a DELIVERY — lá o clique em "Marcar Entregue" também
 * confirma que o motoboy saiu com o pedido (e cobra o COD), algo que o sistema não tem como
 * assumir sozinho sem risco de fechar como pago um pedido ainda na rua.
 */
export const autoDeliverPickupService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { autoDeliverPickupMinutes: true },
    });
    return { minutes: r.autoDeliverPickupMinutes };
  },

  async update(tenantId: string, data: { minutes: number | null }) {
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { autoDeliverPickupMinutes: data.minutes },
      select: { autoDeliverPickupMinutes: true },
    });
    return { minutes: r.autoDeliverPickupMinutes };
  },

  /**
   * Varre todos os tenants com a entrega automática de retirada ligada e fecha (paga) quem
   * já passou do tempo configurado parado em "Pronto" (readyAt, carimbado por
   * order.service.ts#syncOrderStatus). Chamado periodicamente por um setInterval em
   * server.ts — nunca em testes (que sobem só createApp(), não bootstrap()).
   *
   * Reusa paymentService.deliverOnline() (o mesmo efeito do clique manual em "Marcar
   * Entregue") em vez de duplicar a lógica de pagamento/auditoria/socket. Atribuído ao
   * ADMIN mais antigo do tenant (Payment.cashierId é obrigatório — não há um "usuário
   * sistema" dedicado); sem nenhum ADMIN ativo, pula o tenant e registra um aviso.
   *
   * Falha isolada num pedido não interrompe a varredura dos demais.
   */
  async sweep(): Promise<void> {
    const restaurants = await prisma.restaurant.findMany({
      where: { autoDeliverPickupMinutes: { not: null } },
      select: { id: true, autoDeliverPickupMinutes: true },
    });

    for (const restaurant of restaurants) {
      const minutes = restaurant.autoDeliverPickupMinutes;
      if (!minutes || minutes <= 0) continue;

      const due = await prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          orderType: OrderType.PICKUP,
          status: OrderStatus.READY_FOR_PAYMENT,
          archivedAt: null,
          readyAt: { lte: new Date(Date.now() - minutes * 60_000) },
        },
        select: { id: true },
      });
      if (due.length === 0) continue;

      const actor = await prisma.user.findFirst({
        where: { restaurantId: restaurant.id, role: Role.ADMIN, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!actor) {
        logger.warn('auto_deliver_pickup_no_admin', { restaurantId: restaurant.id, pending: due.length });
        continue;
      }

      for (const order of due) {
        try {
          await paymentService.deliverOnline(order.id, { userId: actor.id, tenantId: restaurant.id });
          logger.info('auto_deliver_pickup_delivered', { restaurantId: restaurant.id, orderId: order.id });
        } catch (e) {
          logger.error('auto_deliver_pickup_failed', {
            restaurantId: restaurant.id,
            orderId: order.id,
            error: e instanceof Error ? e.message : e,
          });
        }
      }
    }
  },
};
