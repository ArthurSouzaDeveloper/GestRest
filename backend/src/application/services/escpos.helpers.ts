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
   * prato de cara no ticket (ex.: "1x Pastel - Mussarela"), sem reintroduzir a categoria
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
  /** "2a VIA" na segunda cópia de pedidos de entrega/retirada (ver printJob.service.ts) —
   * null na via normal, pra não confundir a equipe com o que pareceria um pedido duplicado. */
  copyLabel?: string | null;
  /** Forma de pagamento declarada pelo cliente no site (delivery/retirada — pagamento na
   * entrega/retirada). null pra pedido de mesa, que paga no caixa depois de pronto e não
   * declara forma de pagamento antecipada. Pedido do dono do restaurante: quem entrega
   * precisa saber o que cobrar sem abrir o sistema. */
  paymentMethod?: PaymentMethod | null;
  /** "Troco pra quanto" — só relevante (e só chega preenchido) quando paymentMethod é CASH. */
  changeFor?: number | null;
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
  const parts: Buffer[] = [INIT, HEADER_MODE_ON, line(STATION_LABEL[input.station]), BODY_MODE_ON];

  if (input.copyLabel) {
    parts.push(HEADER_MODE_ON, line(`*** ${input.copyLabel} ***`), BODY_MODE_ON);
  }

  const origin = input.tableNumber != null ? `MESA ${input.tableNumber}` : ORDER_TYPE_LABEL[input.orderType];
  parts.push(line(`${origin} - PEDIDO #${input.orderNumber}`));
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
  parts.push(line('--------------------------------'));

  for (const item of input.items) {
    // Pedido do dono do restaurante: nome, quantidade, descrição e valor — sem a
    // categoria crua do produto (nem cozinha, nem suqueiros), só o tipo do prato
    // (pastel/mini pizza/porção) quando informado, prefixado ao nome do sabor.
    // Linha do prato no mesmo tamanho grande do cabeçalho (COZINHA/SUQUEIROS) — pedido
    // explícito do cliente pra dar pra ler de longe na bancada de produção; volta pro
    // BODY_MODE_ON (não pro normal) depois, já que o resto do ticket também é maior agora.
    const label = item.typeLabel ? `${item.typeLabel} - ${item.name}` : item.name;
    parts.push(HEADER_MODE_ON, line(`${item.quantity}x ${label}`), BODY_MODE_ON);
    if (item.description) parts.push(line(`  ${item.description}`));
    parts.push(line(`  ${formatCurrency(item.unitPrice)} / un.`));
    for (const additional of item.additionals) parts.push(line(`  + ${additional}`));
    if (item.notes) parts.push(line(`  obs: ${item.notes}`));
  }

  parts.push(line('--------------------------------'), feedLines(4), PARTIAL_CUT);
  return Buffer.concat(parts);
}
