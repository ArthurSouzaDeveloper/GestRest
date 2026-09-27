import { Prisma, Station } from '@prisma/client';
import { renderTicket, type TicketItem } from './escpos.helpers';
import { itemDisplayName } from './order.helpers';

type CreatedOrderItem = Prisma.OrderItemGetPayload<{
  include: { product: { include: { category: true } }; additionals: true };
}>;

/**
 * Deriva o tipo do prato pro ticket a partir do NOME da categoria (contém "pastel"/
 * "mini pizza"/"porção" + "doce"/"salgad[o|a]"?), em vez de bater a string inteira e
 * exata — "Pastéis Salgados", "Pastel salgado", "MINI PIZZA Doce" etc. caem todos na
 * mesma regra, sem acento/maiúscula importar nem quebrar silenciosamente se a categoria
 * for renomeada no cardápio (foi exatamente isso que aconteceu: o mapeamento por nome
 * exato antigo não bateu com a categoria real de pastel em produção). Pedido explícito
 * do cliente pra mostrar salgado/doce também (ex.: "1- Pastel Salgado - Mussarela").
 * Categoria fora dessas 3 famílias (ex.: "Sucos") não ganha prefixo nenhum — mostrar
 * "SUCOS" no ticket de suco já foi removido a pedido do próprio cliente antes.
 */
export function categoryTypeLabel(categoryName: string): string | null {
  const name = categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const isDoce = name.includes('doce');
  if (name.includes('mini pizza')) return isDoce ? 'Mini Pizza Doce' : 'Mini Pizza Salgada';
  if (name.includes('pastel') || name.includes('pasteis')) return isDoce ? 'Pastel Doce' : 'Pastel Salgado';
  if (name.includes('porcao') || name.includes('porcoes')) return 'Porção';
  return null;
}

/**
 * "Sugestões da Casa" (doce ou salgada) tem sabores fixos/curados — a cozinha já sabe de
 * cor o que leva dentro, então repetir a descrição do produto no ticket só ocupa espaço.
 * Pedido explícito do cliente. Comparação por conteúdo (não string exata), mesmo motivo
 * de categoryTypeLabel acima: sobrevive a uma renomeação da categoria no cardápio.
 */
function isHouseSuggestion(categoryName: string): boolean {
  return categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .includes('sugest');
}

/**
 * Ordem fixa dos itens na via da cozinha (e na parte de cozinha da via combinada do
 * motoboy) — pedido explícito do cliente pra sempre sair na mesma sequência, não a ordem
 * em que o cliente escolheu os itens no site. "Sugestões da Casa" entra na frente (mesmo
 * critério já usado no cardápio, ver reorder-categories-add-frapes-rei-do-suco.ts); os
 * demais fora dessas 4 famílias (não deveria existir na estação COZINHA, mas por segurança)
 * ficam por último, mantendo a ordem relativa entre si (sort estável).
 */
function kitchenSortPriority(categoryName: string): number {
  const name = categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (name.includes('sugest')) return 0;
  if (name.includes('pastel') || name.includes('pasteis')) return 1;
  if (name.includes('mini pizza')) return 2;
  if (name.includes('porcao') || name.includes('porcoes')) return 3;
  return 4;
}

/** Um item de pedido -> item de ticket, com as mesmas regras de conteúdo em qualquer
 * ticket que o item apareça (via normal por estação, ou a via combinada do motoboy
 * abaixo) — extraído pra não duplicar (e arriscar desalinhar) essa lógica nos dois
 * lugares. */
function toTicketItem(item: CreatedOrderItem): TicketItem {
  // "Monte o Seu Pastel"/"Monte o Seu Pastel Doce": o nome do produto não diz nada pra
  // quem prepara — o que importa é o que o cliente escolheu por dentro. Pedido explícito
  // do cliente: no lugar do nome genérico, o título vira a lista de ingredientes
  // escolhidos em CAIXA ALTA, sem tipo/descrição (ambos genéricos aqui).
  if (item.product.isCustom) {
    return {
      name: item.additionals.map((a) => a.name.toUpperCase()).join(', '),
      typeLabel: null,
      description: null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      notes: item.notes,
      additionals: [],
    };
  }
  return {
    name: itemDisplayName(item.product.name, item.comboLabel),
    typeLabel: categoryTypeLabel(item.product.category.name),
    description: isHouseSuggestion(item.product.category.name) ? null : item.product.description,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    notes: item.notes,
    additionals: item.additionals.map((a) => a.name),
  };
}

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
        declaredPaymentMethod: true,
        changeFor: true,
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

    // Total do pedido e aviso de bebidas na via do motoboy: os dois precisam refletir o
    // pedido INTEIRO (não só os itens desta leva), então busca à parte só quando
    // necessário (entrega) — evita essa consulta extra em toda comanda de mesa, que é o
    // caso mais comum e não usa nenhum dos dois campos.
    let orderTotal: number | null = null;
    let hasBeverages = false;
    if (order.orderType === 'DELIVERY') {
      const full = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          discount: true,
          deliveryFee: true,
          serviceRate: true,
          items: {
            where: { status: { not: 'CANCELLED' } },
            select: { quantity: true, unitPrice: true, station: true, additionals: { select: { price: true } } },
          },
        },
      });
      hasBeverages = full.items.some((i) => i.station === Station.JUICE_BAR);
      // Mesma fórmula de order.helpers.ts#computeTotals (subtotal - desconto + serviço +
      // entrega) — não dá pra chamar a função direto aqui porque ela espera o payload
      // completo do pedido (orderInclude, com produto/pagamentos etc.), e aqui só
      // precisamos do total, não do objeto inteiro.
      const round = (n: number) => Math.round(n * 100) / 100;
      const subtotal = full.items.reduce((acc, item) => {
        const extras = item.additionals.reduce((a, ad) => a + Number(ad.price), 0);
        return acc + (Number(item.unitPrice) + extras) * item.quantity;
      }, 0);
      const discount = Number(full.discount);
      const serviceFee = round(((subtotal - discount) * Number(full.serviceRate)) / 100);
      orderTotal = round(subtotal - discount + serviceFee + Number(full.deliveryFee));
    }

    const commonTicketFields = {
      tableNumber: order.table?.number ?? null,
      orderType: order.orderType,
      orderNumber: order.number,
      customerName: order.customer?.name ?? null,
      customerPhone: order.customer?.phone ?? null,
      deliveryAddress,
      placedAt: order.openedAt,
      paymentMethod: order.declaredPaymentMethod,
      changeFor: order.changeFor !== null ? Number(order.changeFor) : null,
    };

    // Cozinha imprime na ordem fixa (Sugestões da Casa, Pastel, Mini Pizza, Porção) — ver
    // kitchenSortPriority; suco não muda (pedido explícito do cliente: "não alterar a
    // ordem dos sucos").
    const kitchenItems = [...(byStation.get(Station.KITCHEN) ?? [])].sort(
      (a, b) => kitchenSortPriority(a.product.category.name) - kitchenSortPriority(b.product.category.name),
    );
    const juiceItems = byStation.get(Station.JUICE_BAR) ?? [];

    // Uma via por estação tocada (COZINHA e/ou SUQUEIROS) — cada uma fica na própria
    // bancada de produção, só com os itens que aquela estação prepara. Ordem fixa
    // (cozinha sempre antes de suqueiros), não a ordem em que os itens foram
    // adicionados ao pedido — pedido do cliente pra sempre sair "PEDIDOS COZINHA,
    // PEDIDOS SUCOS" nessa sequência, sem depender de qual item o cliente escolheu primeiro.
    for (const [station, stationItems, itemSeparator] of [
      [Station.KITCHEN, kitchenItems, true],
      [Station.JUICE_BAR, juiceItems, false],
    ] as const) {
      if (stationItems.length === 0) continue;
      await tx.printJob.create({
        data: {
          restaurantId: tenantId,
          orderId,
          station,
          payload: renderTicket({
            ...commonTicketFields,
            station,
            itemSeparator,
            items: stationItems.map(toTicketItem),
          }),
        },
      });
    }

    // Entrega sai com mais uma via, além das de produção: uma via ÚNICA com TODOS os
    // itens do pedido (cozinha + suqueiros juntos, cozinha na ordem fixa acima e suco
    // logo depois), pra dar pro motoboy uma coisa só em vez de uma cópia por estação que
    // ele precisaria juntar sozinho (pedido explícito do cliente). Mesa não ganha via
    // extra (quem prepara e quem serve estão no mesmo lugar) e retirada também não (o
    // próprio cliente vem buscar).
    if (order.orderType === 'DELIVERY') {
      // Fica na estação da cozinha quando ela participa do pedido (mesmo critério de
      // "estação principal" usado em outras telas do sistema); só cai pra suqueiros num
      // pedido de puro suco, sem nenhum item de cozinha.
      const deliveryStation = kitchenItems.length > 0 ? Station.KITCHEN : Station.JUICE_BAR;
      await tx.printJob.create({
        data: {
          restaurantId: tenantId,
          orderId,
          station: deliveryStation,
          payload: renderTicket({
            ...commonTicketFields,
            station: deliveryStation,
            headerOverride: 'PEDIDO COMPLETO',
            copyLabel: '2a VIA - MOTOBOY',
            hasBeverages,
            orderTotal,
            items: [...kitchenItems, ...juiceItems].map(toTicketItem),
          }),
        },
      });
    }
  },
};
