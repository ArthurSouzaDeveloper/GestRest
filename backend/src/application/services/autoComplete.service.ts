import { OrderStatus, OrderType, ProductionStatus, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { orderService } from './order.service';
import { paymentService } from './payment.service';

/**
 * Conclusão automática pelo tempo estimado — pedido explícito do dono: o pedido online
 * (retirada ou entrega) deve aparecer como pronto/entregue sozinho depois do tempo que o
 * restaurante prometeu ao cliente + uma margem (10 min por padrão), sem ninguém clicar.
 *
 * O "tempo prometido" é Order.estimatedReadyAt, travado na confirmação a partir da
 * configuração do tempo estimado (etaService: modo manual do dono ou automático por fila) —
 * o mesmo horário que o cliente vê na tela de acompanhamento. Se o pedido foi aceito depois
 * de criado, a contagem anda junto (o prazo vale a partir do aceite), pra um aceite atrasado
 * não fechar o pedido na hora.
 *
 * Nunca toca em PENDING (ninguém aceitou — a cozinha talvez nem saiba do pedido), PAID,
 * CANCELLED, arquivados nem DINE_IN. Config direto em Restaurant, mesmo padrão de
 * autoDeliverPickupService; escrita restrita a ADMIN em catalog.routes.ts.
 */
export const autoCompleteService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { autoCompleteMarginMinutes: true },
    });
    return { marginMinutes: r.autoCompleteMarginMinutes };
  },

  async update(tenantId: string, data: { marginMinutes: number | null }) {
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { autoCompleteMarginMinutes: data.marginMinutes },
      select: { autoCompleteMarginMinutes: true },
    });
    return { marginMinutes: r.autoCompleteMarginMinutes };
  },

  /**
   * Prazo de conclusão de um pedido: horário previsto (empurrado pro aceite, se aceito
   * depois de criado) + margem. null quando o pedido não tem previsão (pedidos antigos).
   */
  deadline(
    order: { createdAt: Date; acceptedAt: Date | null; estimatedReadyAt: Date | null },
    marginMinutes: number,
  ): Date | null {
    if (!order.estimatedReadyAt) return null;
    let readyAt = order.estimatedReadyAt.getTime();
    if (order.acceptedAt && order.acceptedAt > order.createdAt) {
      readyAt = Math.max(readyAt, order.acceptedAt.getTime() + (readyAt - order.createdAt.getTime()));
    }
    return new Date(readyAt + marginMinutes * 60_000);
  },

  /**
   * Varre os tenants com a conclusão automática ligada e conclui quem passou do prazo:
   * marca como prontos os itens ainda em produção (orderService.setItemStatus, o mesmo
   * clique da tela de produção — status, auditoria e sockets) e fecha o pedido com
   * paymentService.deliverOnline (o mesmo "Marcar Entregue" — pagamento, financeiro,
   * auditoria e sockets). Atribuído ao ADMIN mais antigo do tenant, como em
   * autoDeliverPickupService. Idempotente: quem já foi concluído sai do filtro de status.
   * Chamado por um setInterval em server.ts; `restaurantId` restringe a um tenant (testes).
   */
  async sweep(opts: { restaurantId?: string; now?: Date } = {}): Promise<void> {
    const now = opts.now ?? new Date();
    const restaurants = await prisma.restaurant.findMany({
      where: { autoCompleteMarginMinutes: { not: null }, ...(opts.restaurantId ? { id: opts.restaurantId } : {}) },
      select: { id: true, autoCompleteMarginMinutes: true },
    });

    for (const restaurant of restaurants) {
      const margin = restaurant.autoCompleteMarginMinutes;
      if (margin == null || margin < 0) continue;

      // Pré-filtro barato no banco (previsão + margem já passou); o ajuste pelo aceite
      // atrasado é feito em deadline() logo abaixo.
      const candidates = await prisma.order.findMany({
        where: {
          restaurantId: restaurant.id,
          orderType: { in: [OrderType.PICKUP, OrderType.DELIVERY] },
          status: { in: [OrderStatus.OPEN, OrderStatus.IN_PRODUCTION, OrderStatus.READY_FOR_PAYMENT] },
          archivedAt: null,
          estimatedReadyAt: { lte: new Date(now.getTime() - margin * 60_000) },
        },
        select: { id: true, createdAt: true, acceptedAt: true, estimatedReadyAt: true },
      });
      const due = candidates.filter((o) => {
        const d = autoCompleteService.deadline(o, margin);
        return d !== null && d <= now;
      });
      if (due.length === 0) continue;

      const actor = await prisma.user.findFirst({
        where: { restaurantId: restaurant.id, role: Role.ADMIN, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!actor) {
        logger.warn('auto_complete_no_admin', { restaurantId: restaurant.id, pending: due.length });
        continue;
      }
      const ctx = { userId: actor.id, tenantId: restaurant.id, role: Role.ADMIN };

      for (const order of due) {
        try {
          const items = await prisma.orderItem.findMany({
            where: { orderId: order.id, status: { notIn: [ProductionStatus.DONE, ProductionStatus.CANCELLED] } },
            select: { id: true },
          });
          for (const item of items) {
            await orderService.setItemStatus(item.id, ProductionStatus.DONE, ctx);
          }

          // Sem nenhum item ativo (tudo cancelado) o pedido fica em OPEN e não há o que
          // entregar — deixa pra equipe decidir (cancelar) em vez de forçar um pagamento.
          const current = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
          if (current.status !== OrderStatus.READY_FOR_PAYMENT) continue;

          await paymentService.deliverOnline(order.id, ctx);
          logger.info('auto_complete_delivered', { restaurantId: restaurant.id, orderId: order.id });
        } catch (e) {
          logger.error('auto_complete_failed', {
            restaurantId: restaurant.id,
            orderId: order.id,
            error: e instanceof Error ? e.message : e,
          });
        }
      }
    }
  },
};
