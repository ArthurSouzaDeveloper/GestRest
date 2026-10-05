import { OrderType, PaymentMethod, Station } from '@prisma/client';

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
// Negrito + altura dupla + largura dupla — cabeçalho da estação e o nome de cada prato,
// os dois precisam se destacar bem (dá pra ler de longe) na bancada da produção.
const HEADER_MODE_ON = Buffer.from([ESC, 0x21, 0x38]);
// Negrito + altura dupla (sem largura dupla) — linha de base do resto do ticket (pedido
// do cliente pra aumentar a fonte de tudo, mas sem perder o destaque do prato acima, que
// continua maior por ter largura dupla também).
const BODY_MODE_ON = Buffer.from([ESC, 0x21, 0x18]);
const feedLines = (n: number) => Buffer.from([ESC, 0x64, n]);
const PARTIAL_CUT = Buffer.from([GS, 0x56, 0x01]);

const STATION_LABEL: Record<Station, string> = {
  [Station.KITCHEN]: 'COZINHA',
  [Station.JUICE_BAR]: 'SUQUEIROS',
  [Station.NONE]: '',
};

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'MESA',
  DELIVERY: 'ENTREGA',
  PICKUP: 'RETIRADA',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'DINHEIRO',
  CREDIT: 'CARTAO DE CREDITO',
  DEBIT: 'CARTAO DE DEBITO',
  MEAL_VOUCHER: 'VALE REFEICAO',
};

export interface TicketItem {
  name: string;
  /** "Pastel", "Mini Pizza" ou "Porção" — pedido do cliente pra distinguir o tipo do
   * prato de cara no ticket (ex.: "1- Pastel - Mussarela"), sem reintroduzir a categoria
   * crua do produto na impressão (a soletrada "SUCOS" nos tickets de suco, removida a
   * pedido do próprio cliente, continua fora — ver printJob.service.ts). null/undefined
   * não imprime prefixo nenhum. */
  typeLabel?: string | null;
  quantity: number;
  /** Descrição do produto do cardápio (ex.: "Frango, geleia de pimenta, bacon, queijo e
   * cream cheese.") — nem todo produto tem uma cadastrada. */
  description: string | null;
  /** Preço unitário (por item, já com o valor certo pra combos — ver createOrderItems). */
  unitPrice: number;
  notes?: string | null;
  additionals: string[];
}

export interface TicketDeliveryAddress {
  street: string;
  number: string;
  complement: string | null;
  zoneName: string | null;
  cep: string | null;
}

export interface TicketInput {
  station: Station;
  tableNumber: number | null;
  orderType: OrderType;
  orderNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: TicketDeliveryAddress | null;
  placedAt: Date;
  items: TicketItem[];
  /** "SEGUNDA VIA MOTOBOY" na via combinada de entrega (ver printJob.service.ts) — null na
   * via normal, pra não confundir a equipe com o que pareceria um pedido duplicado. Sai em
   * tamanho normal (não o grande do cabeçalho), com um tracejado antes — pedido do cliente
   * pra economizar papel. */
  copyLabel?: string | null;
  /** Sobrescreve o texto do cabeçalho grande (normalmente "COZINHA"/"SUQUEIROS", ver
   * STATION_LABEL); string vazia ('') omite a linha inteira. Usado só na via combinada de
   * entrega pro motoboy — pedido do cliente pra tirar de vez o "PEDIDO COMPLETO" gigante
   * que tinha ali antes, gastando papel à toa. */
  headerOverride?: string;
  /** Forma de pagamento declarada pelo cliente no site (delivery/retirada — pagamento na
   * entrega/retirada). null pra pedido de mesa, que paga no caixa depois de pronto e não
   * declara forma de pagamento antecipada. Pedido do dono do restaurante: quem entrega
   * precisa saber o que cobrar sem abrir o sistema. */
  paymentMethod?: PaymentMethod | null;
  /** "Troco pra quanto" — só relevante (e só chega preenchido) quando paymentMethod é CASH. */
  changeFor?: number | null;
  /** Valor total do pedido inteiro (não só os itens desta via) — impresso só quando
   * presente, logo antes da forma de pagamento. Hoje só a via combinada do motoboy usa
   * isso; pedido explícito do cliente pra ele conferir o valor sem abrir o sistema. */
  orderTotal?: number | null;
  /** Aviso em destaque logo abaixo do cabeçalho (ex.: "PEDIDO COM BEBIDA", "PEDIDO
   * TAMBEM TEM: PASTEL") — pra quem só vê ESTA via não esquecer que o pedido tem mais
   * coisa em outra estação/via. null/undefined não imprime nada (pedido comum, sem
   * outra estação envolvida). Ver printJob.service.ts. */
  crossStationNotice?: string | null;
  /** true imprime uma linha divisória depois de cada item (nome+descrição+preço+
   * adicionais+obs) — pedido explícito do cliente pra valer em toda via (cozinha, suco/
   * bebida em geral e a via combinada do motoboy), não só comida. */
  itemSeparator?: boolean;
  /** true omite nome/telefone/endereço/total/forma de pagamento/horário, deixando só a
   * linha de origem+número do pedido — pedido explícito do cliente pra economizar papel
   * nas vias secundárias (mini pizza/porção) de um pedido que já tem todos esses dados
   * impressos na via principal (pastel). Ver printJob.service.ts: só é true pra um grupo
   * de cozinha que NÃO é o de menor prioridade presente no pedido. */
  minimalData?: boolean;
}

/**
 * Suporte a codepage varia bastante entre modelo/firmware de impressora ESC/POS, e
 * mandar o comando errado de seleção de tabela de caracteres produz um ticket
 * corrompido — pior do que simplesmente não ter acento. Por segurança, tira o acento
 * antes de imprimir (mesma técnica já usada em superadmin.service.ts#normalizeSlug) em
 * vez de arriscar uma tabela de bytes de codepage não validada contra hardware real.
 * Quando a impressora física estiver disponível pra teste, dá pra trocar por uma
 * codificação com acento se o modelo confirmar suporte.
 */
function toAscii(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function line(text: string): Buffer {
  return Buffer.concat([Buffer.from(toAscii(text), 'ascii'), Buffer.from('\n')]);
}

/**
 * Formata em reais sem usar Intl: Intl.NumberFormat('pt-BR', { style: 'currency' }) separa
 * "R$" do valor com um espaço "não separável" (U+00A0), que não é acentuação — a limpeza de
 * toAscii() não pega — e viraria byte corrompido na impressora. Escrito na mão, é sempre
 * ASCII puro.
 */
function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Monta o conteúdo de um ticket de produção em bytes ESC/POS crus, prontos pra mandar
 * direto pra impressora térmica de rede — ver printJob.service.ts e a spec de
 * impressão automática (docs/superpowers/specs/2026-08-24-impressao-termica-auto-
 * aceite-design.md). Sem dependência nova: ESC/POS é só uma sequência de bytes bem
 * documentada.
 */
export function renderTicket(input: TicketInput): Buffer {
  // headerOverride === '' (não undefined) omite a linha de cabeçalho por completo — usado
  // só na via combinada do motoboy: o cliente achou "PEDIDO COMPLETO" grande demais,
  // gastando papel à toa, e prefere começar direto pelo aviso de bebida (se houver).
  const headerText = input.headerOverride ?? STATION_LABEL[input.station];
  const parts: Buffer[] = [INIT];
  if (headerText) {
    parts.push(HEADER_MODE_ON, line(headerText), BODY_MODE_ON);
  } else {
    parts.push(BODY_MODE_ON);
  }

  // Logo no topo (antes de qualquer outra informação) — pedido explícito do cliente pra
  // ser a primeira coisa que quem pega a via vê, e não esquecer de buscar o resto do
  // pedido que está em outra estação/via. Só UM traço separador, em tamanho normal (não
  // o grande do cabeçalho) — a versão anterior tinha um traço grande ANTES e outro
  // DEPOIS do aviso, e por serem largura dupla cada um quebrava em 2 linhas na impressora,
  // gastando papel à toa (pedido do cliente pra economizar).
  if (input.crossStationNotice) {
    parts.push(line('--------------------------------'), HEADER_MODE_ON, line(input.crossStationNotice), BODY_MODE_ON);
  }

  // Tamanho normal do corpo (não o grande do cabeçalho) — pedido do cliente pra
  // economizar papel; um tracejado antes já deixa claro que é uma via à parte, sem
  // precisar do destaque gigante de antes.
  if (input.copyLabel) {
    parts.push(line('--------------------------------'), line(input.copyLabel));
  }

  const origin = input.tableNumber != null ? `MESA ${input.tableNumber}` : ORDER_TYPE_LABEL[input.orderType];
  parts.push(line(`${origin} - PEDIDO #${input.orderNumber}`));
  // minimalData: via secundária (mini pizza/porção) de um pedido que também tem pastel —
  // os dados completos já saem na via principal, então aqui só o número do pedido mesmo
  // (pedido explícito do cliente pra economizar papel).
  if (!input.minimalData) {
    if (input.customerName) parts.push(line(input.customerName));
    if (input.customerPhone) parts.push(line(`Tel: ${input.customerPhone}`));
    if (input.deliveryAddress) {
      const addr = input.deliveryAddress;
      parts.push(line(`${addr.street}, ${addr.number}${addr.complement ? ` - ${addr.complement}` : ''}`));
      if (addr.zoneName) parts.push(line(addr.zoneName));
      if (addr.cep) parts.push(line(`CEP: ${addr.cep}`));
    }
    if (input.paymentMethod) {
      const changeNote =
        input.paymentMethod === PaymentMethod.CASH && input.changeFor
          ? ` (troco p/ ${formatCurrency(input.changeFor)})`
          : '';
      parts.push(line(`PAGAMENTO: ${PAYMENT_METHOD_LABEL[input.paymentMethod]}${changeNote}`));
    }
    // Horário fixado à zona de São Paulo de propósito — o container do backend roda em
    // UTC, então usar o fuso padrão do processo mostraria uma hora adiantada no ticket.
    parts.push(line(input.placedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })));
  }
  parts.push(line('--------------------------------'));

  for (const item of input.items) {
    // Pedido do dono do restaurante: nome, quantidade, descrição e valor — sem a
    // categoria crua do produto (nem cozinha, nem suqueiros), só o tipo do prato
    // (pastel/mini pizza/porção) quando informado, prefixado ao nome do sabor.
    // Linha do prato no mesmo tamanho grande do cabeçalho (COZINHA/SUQUEIROS) — pedido
    // explícito do cliente pra dar pra ler de longe na bancada de produção; volta pro
    // BODY_MODE_ON (não pro normal) depois, já que o resto do ticket também é maior agora.
    const label = item.typeLabel ? `${item.typeLabel} - ${item.name}` : item.name;
    // "1-" em vez de "1x" — pedido explícito do cliente, em toda categoria e toda via.
    parts.push(HEADER_MODE_ON, line(`${item.quantity}- ${label}`), BODY_MODE_ON);
    if (item.description) parts.push(line(`  ${item.description}`));
    parts.push(line(`  ${formatCurrency(item.unitPrice)} / un.`));
    for (const additional of item.additionals) parts.push(line(`  + ${additional}`));
    if (item.notes) parts.push(line(`  obs: ${item.notes}`));
    if (input.itemSeparator) parts.push(line('----------------------------'));
  }

  // Abaixo do ÚLTIMO item, não mais junto dos dados do cliente no topo — pedido explícito
  // do cliente pra conferir o valor junto da lista de itens, não lá em cima antes de ver o
  // que está sendo cobrado.
  if (input.orderTotal != null) {
    parts.push(line('--------------------------------'), line(`TOTAL DO PEDIDO: ${formatCurrency(input.orderTotal)}`));
  }

  parts.push(line('--------------------------------'), feedLines(4), PARTIAL_CUT);
  return Buffer.concat(parts);
}
