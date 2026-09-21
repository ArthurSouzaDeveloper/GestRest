import { Prisma, Station } from '@prisma/client';
import { renderTicket, type TicketItem } from './escpos.helpers';
import { itemDisplayName } from './order.helpers';

type CreatedOrderItem = Prisma.OrderItemGetPayload<{
  include: { product: { include: { category: true } }; additionals: true };
}>;

/**
 * Nomes de categoria de hoje (ver import-menu-rei-do-suco.ts) -> tipo do prato pra
 * mostrar no ticket, pedido explícito do cliente (ex.: "1x Pastel - Mussarela"). Uma
 * categoria fora dessa lista (ex.: "Sucos") não ganha prefixo — mostrar "SUCOS" no
 * ticket de suco já foi removido a pedido do próprio cliente antes.
 */
const CATEGORY_TYPE_LABEL: Record<string, string> = {
  'Pastéis Salgados': 'Pastel',
  'Pastéis Doces': 'Pastel',
  'Mini Pizza Salgada': 'Mini Pizza',
  'Mini Pizza Doce': 'Mini Pizza',
  Porções: 'Porção',
};

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
        openedAt: true,
        table: { select: { number: true } },
        customer: { select: { name: true, phone: true } },
        deliveryZone: { select: { name: true } },
        deliveryStreet: true,
        deliveryNumber: true,
        deliveryComplement: true,
        deliveryCep: true,
      },
    });
    const deliveryAddress =
      order.orderType === 'DELIVERY' && order.deliveryStreet && order.deliveryNumber
        ? {
            street: order.deliveryStreet,
            number: order.deliveryNumber,
            complement: order.deliveryComplement,
            zoneName: order.deliveryZone?.name ?? null,
            cep: order.deliveryCep,
          }
        : null;

    for (const [station, stationItems] of byStation) {
      const ticketItems: TicketItem[] = stationItems.map((item) => ({
        name: itemDisplayName(item.product.name, item.comboLabel),
        typeLabel: CATEGORY_TYPE_LABEL[item.product.category.name] ?? null,
        description: item.product.description,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        notes: item.notes,
        additionals: item.additionals.map((a) => a.name),
      }));
      const baseTicket = {
        station,
        tableNumber: order.table?.number ?? null,
        orderType: order.orderType,
        orderNumber: order.number,
        customerName: order.customer?.name ?? null,
        customerPhone: order.customer?.phone ?? null,
        deliveryAddress,
        placedAt: order.openedAt,
        items: ticketItems,
      };
      await tx.printJob.create({
        data: { restaurantId: tenantId, orderId, station, payload: renderTicket(baseTicket) },
      });

      // Só entrega sai em 2 vias — o motoboy leva uma anexada ao pedido, a outra fica no
      // restaurante como comprovante (pedido explícito do dono do restaurante). Mesa não
      // duplica (quem prepara e quem serve estão no mesmo lugar) e retirada também não
      // duplica mais — o próprio cliente vem buscar, não precisa de via extra pra ninguém
      // levar junto.
      if (order.orderType === 'DELIVERY') {
        await tx.printJob.create({
          data: {
            restaurantId: tenantId,
            orderId,
            station,
            payload: renderTicket({ ...baseTicket, copyLabel: '2a VIA' }),
          },
        });
      }
    }
  },
};
