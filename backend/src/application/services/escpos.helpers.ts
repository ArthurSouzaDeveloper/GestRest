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
  quantity: number;
  notes?: string | null;
  additionals: string[];
}

export interface TicketInput {
  station: Station;
  tableNumber: number | null;
  orderType: OrderType;
  orderNumber: number;
  customerName: string | null;
  items: TicketItem[];
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
 * Monta o conteúdo de um ticket de produção em bytes ESC/POS crus, prontos pra mandar
 * direto pra impressora térmica de rede — ver printJob.service.ts e a spec de
 * impressão automática (docs/superpowers/specs/2026-08-24-impressao-termica-auto-
 * aceite-design.md). Sem dependência nova: ESC/POS é só uma sequência de bytes bem
 * documentada.
 */
export function renderTicket(input: TicketInput): Buffer {
  const parts: Buffer[] = [INIT, HEADER_MODE_ON, line(STATION_LABEL[input.station]), NORMAL_MODE];

  const origin = input.tableNumber != null ? `MESA ${input.tableNumber}` : ORDER_TYPE_LABEL[input.orderType];
  parts.push(BOLD_ON, line(`${origin} - PEDIDO #${input.orderNumber}`), BOLD_OFF);
  if (input.customerName) parts.push(line(input.customerName));
  parts.push(line(new Date().toLocaleString('pt-BR')));
  parts.push(line('--------------------------------'));

  for (const item of input.items) {
    parts.push(BOLD_ON, line(`${item.quantity}x ${item.name}`), BOLD_OFF);
    for (const additional of item.additionals) parts.push(line(`  + ${additional}`));
    if (item.notes) parts.push(line(`  obs: ${item.notes}`));
  }

  parts.push(line('--------------------------------'), feedLines(4), PARTIAL_CUT);
  return Buffer.concat(parts);
}
