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
 * Ordem fixa dos itens/papéis da cozinha (e da parte de cozinha da via combinada do
 * motoboy, que continua numa via só) — pedido explícito do cliente pra sempre sair na
 * mesma sequência, não a ordem em que o cliente escolheu os itens no site. Cada valor
 * diferente também separa os itens em PAPÉIS distintos na via normal da cozinha (ver
 * enqueueForItems): um papel só de Pastel, um só de Mini Pizza, um só de Porção. "Sugestões
 * da Casa" entra no MESMO papel de Pastel (pedido explícito do cliente: são pastéis também
 * — sabores curados/premium —, e saíam incorretamente numa via separada antes); doce e
 * salgado da mesma família também ficam juntos (o "typeLabel" de cada item já distingue
 * isso na linha). Os demais fora dessas famílias (não deveria existir na estação COZINHA,
 * mas por segurança) caem num papel por último, mantendo a ordem relativa entre si (sort
 * estável).
 */
function kitchenSortPriority(categoryName: string): number {
  const name = categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (name.includes('sugest') || name.includes('pastel') || name.includes('pasteis')) return 0;
  if (name.includes('mini pizza')) return 1;
  if (name.includes('porcao') || name.includes('porcoes')) return 2;
  return 3;
}

/**
 * Versão curta do tipo do prato (sem doce/salgado) pro aviso "PEDIDO TAMBEM TEM: ..." na
 * via dos suqueiros e pro cabeçalho de cada papel da cozinha ("COZINHA - PASTEL" etc.) —
 * pedido explícito do cliente: às vezes quem faz o pedido não é quem vem buscar, e sem
 * esse aviso a pessoa que só vê a via do suco não sabe que também tem comida esperando na
 * cozinha (ou vice-versa). "Sugestões da Casa" vira "PASTEL" aqui também, mesmo critério
 * de kitchenSortPriority acima — são a mesma família pro resto do sistema.
 */
function kitchenTypeSummary(categoryName: string): string {
  const name = categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (name.includes('mini pizza')) return 'MINI PIZZA';
  if (name.includes('sugest') || name.includes('pastel') || name.includes('pasteis')) return 'PASTEL';
  if (name.includes('porcao') || name.includes('porcoes')) return 'PORCAO';
  return 'COMIDA';
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

    // Avisos "PEDIDO TAMBEM TEM ..." (pra quem só vê UMA via não esquecer que o pedido
    // tem mais coisa em outra estação — pedido explícito do cliente, ver
    // kitchenTypeSummary acima) e o total na via do motoboy precisam refletir o pedido
    // INTEIRO, não só os itens desta leva (um pedido de mesa pode ganhar item de cozinha
    // e suco em pedidos (addItems) separados ao longo do atendimento) — por isso busca à
    // parte em vez de reaproveitar só o parâmetro `items`.
    const full = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        discount: true,
        deliveryFee: true,
        serviceRate: true,
        items: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            quantity: true,
            unitPrice: true,
            station: true,
            additionals: { select: { price: true } },
            product: { select: { category: { select: { name: true } } } },
          },
        },
      },
    });
    const hasBeverages = full.items.some((i) => i.station === Station.JUICE_BAR);
    const fullKitchenItems = full.items.filter((i) => i.station === Station.KITCHEN);
    const kitchenSummary = [...new Set(fullKitchenItems.map((i) => kitchenTypeSummary(i.product.category.name)))].join(
      ', ',
    );

    let orderTotal: number | null = null;
    if (order.orderType === 'DELIVERY') {
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

    // Cozinha imprime na ordem fixa (Pastel — incluindo Sugestões da Casa —, Mini Pizza,
    // Porção) — ver kitchenSortPriority; suco não muda (pedido explícito do cliente: "não
    // alterar a ordem dos sucos").
    const kitchenItems = [...(byStation.get(Station.KITCHEN) ?? [])].sort(
      (a, b) => kitchenSortPriority(a.product.category.name) - kitchenSortPriority(b.product.category.name),
    );
    const juiceItems = byStation.get(Station.JUICE_BAR) ?? [];

    // Cozinha: 1 papel por TIPO de prato presente no pedido (Pastel, Mini Pizza, Porção,
    // Sugestão da Casa), não mais 1 papel só com tudo junto — pedido explícito do cliente
    // pra dar pra dividir o preparo entre quem faz cada tipo na mesma bancada. Mesmo
    // agrupamento/ordem fixa de kitchenSortPriority (doce e salgado da mesma família
    // ficam no mesmo papel, já que o "typeLabel" de cada item já distingue isso na
    // linha — ver toTicketItem); um pedido com só 1 tipo continua saindo num papel só,
    // como já era antes.
    const kitchenGroups = new Map<number, CreatedOrderItem[]>();
    for (const item of kitchenItems) {
      const priority = kitchenSortPriority(item.product.category.name);
      const group = kitchenGroups.get(priority) ?? [];
      group.push(item);
      kitchenGroups.set(priority, group);
    }
    // A via de menor prioridade presente (Pastel se houver; senão Mini Pizza; senão
    // Porção) é a "principal" do pedido e carrega nome/telefone/endereço/forma de
    // pagamento/horário completos — as demais mostram só o número do pedido, pedido
    // explícito do cliente pra economizar papel (esses dados já saem na via principal).
    // Se não tiver pastel, a via de mini pizza reconhece isso e vira a principal.
    const mainKitchenPriority = kitchenGroups.size > 0 ? Math.min(...kitchenGroups.keys()) : null;
    for (const [priority, groupItems] of [...kitchenGroups.entries()].sort(([a], [b]) => a - b)) {
      await tx.printJob.create({
        data: {
          restaurantId: tenantId,
          orderId,
          station: Station.KITCHEN,
          payload: renderTicket({
            ...commonTicketFields,
            station: Station.KITCHEN,
            // Identifica o tipo no próprio cabeçalho ("COZINHA - PASTEL") — com vários
            // papéis de cozinha por pedido agora, precisa dar pra saber de qual é qual
            // sem ter que ler item por item.
            headerOverride: `COZINHA - ${kitchenTypeSummary(groupItems[0].product.category.name)}`,
            // Linha divisória depois de cada item, em qualquer via — pedido explícito do
            // cliente pra valer pra suco/bebida em geral também, não só comida.
            itemSeparator: true,
            crossStationNotice: hasBeverages ? 'PEDIDO COM BEBIDA' : null,
            minimalData: priority !== mainKitchenPriority,
            items: groupItems.map(toTicketItem),
          }),
        },
      });
    }

    // Suqueiros: via única com tudo que a estação prepara (sem a divisão por tipo da
    // cozinha acima — o cliente só pediu a separação por papel pra cozinha).
    if (juiceItems.length > 0) {
      await tx.printJob.create({
        data: {
          restaurantId: tenantId,
          orderId,
          station: Station.JUICE_BAR,
          payload: renderTicket({
            ...commonTicketFields,
            station: Station.JUICE_BAR,
            itemSeparator: true,
            crossStationNotice: fullKitchenItems.length > 0 ? `PEDIDO TAMBEM TEM: ${kitchenSummary}` : null,
            items: juiceItems.map(toTicketItem),
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
            // Sem cabeçalho grande aqui de propósito (pedido do cliente: "PEDIDO COMPLETO"
            // gastava papel demais) — começa direto pelo aviso de bebida (se houver) e o
            // tracejado + "SEGUNDA VIA MOTOBOY" em tamanho normal.
            headerOverride: '',
            copyLabel: 'SEGUNDA VIA MOTOBOY',
            crossStationNotice: hasBeverages ? 'PEDIDO COM BEBIDAS' : null,
            orderTotal,
            itemSeparator: true,
            items: [...kitchenItems, ...juiceItems].map(toTicketItem),
          }),
        },
      });
    }
  },
};
