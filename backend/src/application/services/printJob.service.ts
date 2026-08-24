import { Prisma, Station } from '@prisma/client';
import { renderTicket, type TicketItem } from './escpos.helpers';
import { itemDisplayName } from './order.helpers';

type CreatedOrderItem = Prisma.OrderItemGetPayload<{ include: { product: true; additionals: true } }>;

/**
 * Gera um trabalho de impressão por estação tocada, sempre que itens ficam
 * visíveis/acionáveis na fila de produção pela primeira vez — chamado dentro da mesma
 * transação que cria/libera esses itens (addItems, accept, openPublic com aceite
 * automático — ver docs/superpowers/specs/2026-08-24-impressao-termica-auto-aceite-
 * design.md). Busca o contexto do pedido (mesa/tipo/número/cliente) internamente, pra
 * cada chamador só precisar passar os itens recém-visíveis.
 */
export const printJobService = {
  async enqueueForItems(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    items: CreatedOrderItem[],
  ): Promise<void> {
    const byStation = new Map<Station, CreatedOrderItem[]>();
    for (const item of items) {
      if (item.station === Station.NONE) continue;
      const list = byStation.get(item.station) ?? [];
      list.push(item);
      byStation.set(item.station, list);
    }
    if (byStation.size === 0) return;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        number: true,
        orderType: true,
        table: { select: { number: true } },
        customer: { select: { name: true } },
      },
    });

    for (const [station, stationItems] of byStation) {
      const ticketItems: TicketItem[] = stationItems.map((item) => ({
        name: itemDisplayName(item.product.name, item.comboLabel),
        quantity: item.quantity,
        notes: item.notes,
        additionals: item.additionals.map((a) => a.name),
      }));
      const payload = renderTicket({
        station,
        tableNumber: order.table?.number ?? null,
        orderType: order.orderType,
        orderNumber: order.number,
        customerName: order.customer?.name ?? null,
        items: ticketItems,
      });
      await tx.printJob.create({
        data: { restaurantId: tenantId, orderId, station, payload },
      });
    }
  },
};
