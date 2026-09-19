import { OrderType, Station } from '@prisma/client';

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
// Negrito + altura dupla + largura dupla — cabeçalho da estação, precisa se destacar
// bem na bancada da produção.
const HEADER_MODE_ON = Buffer.from([ESC, 0x21, 0x38]);
const NORMAL_MODE = Buffer.from([ESC, 0x21, 0x00]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
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

export interface TicketItem {
  name: string;
  /** Nome da categoria do produto (ex.: "Pastéis Salgados", "Mini Pizza Doce") — impresso
   * logo após a quantidade pra equipe não confundir sabores que existem em mais de uma
   * categoria (ex.: "Mussarela" existe tanto em Pastéis quanto em Mini Pizza). */
  category: string;
  quantity: number;
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
  const parts: Buffer[] = [INIT, HEADER_MODE_ON, line(STATION_LABEL[input.station]), NORMAL_MODE];

  if (input.copyLabel) {
    parts.push(HEADER_MODE_ON, line(`*** ${input.copyLabel} ***`), NORMAL_MODE);
  }

  const origin = input.tableNumber != null ? `MESA ${input.tableNumber}` : ORDER_TYPE_LABEL[input.orderType];
  parts.push(BOLD_ON, line(`${origin} - PEDIDO #${input.orderNumber}`), BOLD_OFF);
  if (input.customerName) parts.push(line(input.customerName));
  if (input.customerPhone) parts.push(line(`Tel: ${input.customerPhone}`));
  if (input.deliveryAddress) {
    const addr = input.deliveryAddress;
    parts.push(line(`${addr.street}, ${addr.number}${addr.complement ? ` - ${addr.complement}` : ''}`));
    if (addr.zoneName) parts.push(line(addr.zoneName));
    if (addr.cep) parts.push(line(`CEP: ${addr.cep}`));
  }
  // Horário fixado à zona de São Paulo de propósito — o container do backend roda em
  // UTC, então usar o fuso padrão do processo mostraria uma hora adiantada no ticket.
  parts.push(line(input.placedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })));
  parts.push(line('--------------------------------'));

  for (const item of input.items) {
    parts.push(BOLD_ON);
    // Categoria só ajuda na Cozinha, onde o mesmo sabor existe em categorias diferentes
    // (ex.: "Mussarela" no Pastel e na Mini Pizza) — nos Suqueiros só teria "SUCOS" em
    // toda linha, sem servir pra nada (o sabor/base já vem completo no nome do item).
    if (input.station === Station.KITCHEN) {
      parts.push(line(`${item.quantity}x [${item.category.toUpperCase()}]`), line(item.name));
    } else {
      parts.push(line(`${item.quantity}x ${item.name}`));
    }
    parts.push(BOLD_OFF, line(`  ${formatCurrency(item.unitPrice)} / un.`));
    for (const additional of item.additionals) parts.push(line(`  + ${additional}`));
    if (item.notes) parts.push(line(`  obs: ${item.notes}`));
  }

  parts.push(line('--------------------------------'), feedLines(4), PARTIAL_CUT);
  return Buffer.concat(parts);
}
