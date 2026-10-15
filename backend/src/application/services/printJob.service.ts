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

/**
 * Mesmo critério de família usado acima, mas pro lado dos suqueiros: "Sucos" (feito na
 * hora, fruta+base) vira SUCO; qualquer outra categoria da estação (Açaí e Cupuaçu,
 * Bebidas/água/refrigerante...) vira BEBIDAS PRONTAS — pedido explícito do cliente/dono
 * pra via resumida do motoboy (ver motoboySummaryItems). Nome exato "Sucos" (não um
 * includes solto) porque "Açaí e Cupuaçu" não deve cair aqui por engano.
 */
function juiceTypeSummary(categoryName: string): string {
  const name = categoryName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  return name === 'sucos' ? 'SUCO' : 'BEBIDAS PRONTAS';
}

// 'COMIDA' é o fallback de kitchenTypeSummary pra uma categoria de cozinha que não bate
// nenhuma das 3 famílias por nome (não deveria acontecer no cardápio real, mas por
// segurança: nunca pode sumir item de uma via por categoria com nome fora do padrão,
// mesmo critério defensivo de kitchenTypeSummary/categoryTypeLabel acima). Ordem fixa
// reaproveitada tanto no resumo do motoboy quanto no aviso cruzado entre papéis de
// cozinha abaixo.
const KITCHEN_FAMILY_ORDER = ['PASTEL', 'MINI PIZZA', 'PORCAO', 'COMIDA'];

/**
 * Aviso cruzado impresso em CADA papel de cozinha (ex.: no papel do Pastel) listando o
 * que mais o pedido tem — bebida (se houver) e os OUTROS tipos de cozinha presentes no
 * pedido INTEIRO (Mini Pizza, Porção...), sem repetir o próprio tipo do papel. Antes
 * disso o aviso era sempre o mesmo texto fixo "PEDIDO COM BEBIDA" em todo papel,
 * ignorando se o pedido também tinha Mini Pizza/Porção — achado do cliente/dono: quem só
 * vê o papel do Pastel não sabia que also tinha Porção esperando. null quando não há
 * nada a avisar (nem bebida, nem outro tipo de cozinha).
 */
function kitchenCrossNotice(myType: string, kitchenTypesPresent: Set<string>, hasBeverages: boolean): string | null {
  const parts: string[] = [];
  if (hasBeverages) parts.push('BEBIDA');
  for (const type of KITCHEN_FAMILY_ORDER) {
    if (type !== myType && kitchenTypesPresent.has(type)) parts.push(type);
  }
  return parts.length > 0 ? `PEDIDO COM ${parts.join(', ')}` : null;
}

/**
 * Via do motoboy reduzida (pedido explícito do cliente/dono): em vez de listar cada
 * sabor/descrição/preço, mostra só 1 linha por família presente no pedido — PASTEL, MINI
 * PIZZA, PORCAO, SUCO, BEBIDAS PRONTAS, nessa ordem — com a quantidade total de cada uma.
 * Família ausente no pedido não aparece (sem linha "0-"). Usada com
 * TicketInput.itemsSummaryOnly, que suprime descrição/preço/adicionais/observação por
 * item em renderTicket.
 */
function motoboySummaryItems(kitchenItems: CreatedOrderItem[], juiceItems: CreatedOrderItem[]): TicketItem[] {
  const order = ['PASTEL', 'MINI PIZZA', 'PORCAO', 'SUCO', 'BEBIDAS PRONTAS', 'COMIDA'];
  const counts = new Map<string, number>();
  for (const item of kitchenItems) {
    const key = kitchenTypeSummary(item.product.category.name);
    counts.set(key, (counts.get(key) ?? 0) + item.quantity);
  }
  for (const item of juiceItems) {
    const key = juiceTypeSummary(item.product.category.name);
    counts.set(key, (counts.get(key) ?? 0) + item.quantity);
  }
  return order
    .filter((key) => (counts.get(key) ?? 0) > 0)
    .map((key) => ({
      name: key,
      quantity: counts.get(key)!,
      description: null,
      unitPrice: 0,
      additionals: [],
    }));
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
    // "Monte o Seu" não tem preço próprio (Product.price = 0, "Preço pela montagem") — o
    // valor inteiro vem da base + adicionais escolhidos, gravados em item.additionals (ver
    // createOrderItems em order.service.ts). item.unitPrice sozinho ficaria zerado no
    // ticket se não somasse os adicionais aqui, mesmo cálculo que computeTotals já faz pro
    // total do pedido.
    const additionalsTotal = item.additionals.reduce((sum, a) => sum + Number(a.price), 0);
    return {
      name: item.additionals.map((a) => a.name.toUpperCase()).join(', '),
      typeLabel: null,
      description: null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice) + additionalsTotal,
      notes: item.notes,
      additionals: [],
    };
  }
  return {
    name: itemDisplayName(item.product.name, item.comboLabel),
    // Sem o prefixo "Pastel Salgado"/"Mini Pizza Doce"/etc. (ver categoryTypeLabel, ainda
    // usado só pelo script diagnose-category-labels.ts) — pedido explícito do cliente/
    // dono: cada papel da cozinha já sai dedicado a UM tipo de prato (cabeçalho "COZINHA -
    // PASTEL" etc., ver enqueueForItems), então repetir o tipo em toda linha de sabor só
    // ocupava espaço à toa.
    typeLabel: null,
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
    // Famílias de cozinha presentes no pedido INTEIRO (não só nesta leva) — usado pelo
    // aviso cruzado de cada papel abaixo, mesmo raciocínio de hasBeverages/kitchenSummary
    // (full.items, não `items`/kitchenItems) já explicado ali em cima.
    const fullKitchenTypesPresent = new Set(fullKitchenItems.map((i) => kitchenTypeSummary(i.product.category.name)));
    for (const [priority, groupItems] of [...kitchenGroups.entries()].sort(([a], [b]) => a - b)) {
      const myType = kitchenTypeSummary(groupItems[0].product.category.name);
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
            headerOverride: `COZINHA - ${myType}`,
            // Linha divisória depois de cada item, em qualquer via — pedido explícito do
            // cliente pra valer pra suco/bebida em geral também, não só comida.
            itemSeparator: true,
            // Sem preço (pedido explícito do cliente/dono: quem prepara não precisa do
            // valor, só do sabor/quantidade) — ver hideItemPrice em renderTicket.
            hideItemPrice: true,
            crossStationNotice: kitchenCrossNotice(myType, fullKitchenTypesPresent, hasBeverages),
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
            deliveryFee: Number(full.deliveryFee),
            itemsSummaryOnly: true,
            items: motoboySummaryItems(kitchenItems, juiceItems),
          }),
        },
      });
    }
  },
};
