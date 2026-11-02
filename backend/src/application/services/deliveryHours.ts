/**
 * Horário de pedidos do site público — pedido explícito do dono (31/10/2026), no fuso do
 * restaurante (não no do servidor, que roda em UTC):
 *   - pedidos começam às 18h em ponto (entrega e retirada);
 *   - entrega até 23h (depois não tem motoboy rodando);
 *   - retirada até 23:15;
 *   - das 23:15 às 18h do dia seguinte o site não aceita pedido nenhum;
 *   - só de quarta a domingo (02/11/2026): segunda e terça a loja não abre.
 * Os horários são em minutos desde a meia-noite. Pra mudar é só trocar as constantes aqui E
 * em frontend/src/lib/deliveryHours.ts (o site usa a cópia de lá pra travar os botões; esta
 * aqui é a que vale de verdade e recusa o pedido na API).
 */
export const DELIVERY_TIMEZONE = 'America/Sao_Paulo';
export const ORDERS_OPEN_MINUTE = 18 * 60; // 18:00
export const DELIVERY_CLOSE_MINUTE = 23 * 60; // 23:00
export const PICKUP_CLOSE_MINUTE = 23 * 60 + 15; // 23:15
export const DELIVERY_CLOSED_MESSAGE = 'Após as 23h, somente pedidos por retirada (até 23:15).';
/** Dias em que a loja abre (0 = domingo … 6 = sábado): quarta a domingo. */
export const ORDER_DAYS: readonly number[] = [3, 4, 5, 6, 0];
export const ORDERS_CLOSED_MESSAGE =
  'Fora do horário de pedidos. Aceitamos pedidos de quarta a domingo, das 18h às 23:15 (entrega até 23h).';

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAME_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Dia da semana (0 = domingo) e minutos desde a meia-noite (0-1439) no fuso do restaurante. */
function localTime(now: Date): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: WEEKDAY_INDEX[get('weekday')], minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

function insideWindow(now: Date, closeMinute: number): boolean {
  const { weekday, minute } = localTime(now);
  return ORDER_DAYS.includes(weekday) && minute >= ORDERS_OPEN_MINUTE && minute < closeMinute;
}

/**
 * Quando a loja volta a abrir, pro botão desabilitado: "Abrimos às 18h" se ainda abre hoje,
 * senão "Abrimos quarta às 18h" (ou o próximo dia de funcionamento).
 */
export function reopenLabel(now: Date = new Date()): string {
  const { weekday, minute } = localTime(now);
  if (ORDER_DAYS.includes(weekday) && minute < ORDERS_OPEN_MINUTE) return 'Abrimos às 18h';
  for (let i = 1; i <= 7; i++) {
    const day = (weekday + i) % 7;
    if (ORDER_DAYS.includes(day)) return i === 1 ? 'Abrimos amanhã às 18h' : `Abrimos ${WEEKDAY_NAME_PT[day]} às 18h`;
  }
  return 'Abrimos às 18h';
}

/** Entrega fechada: fora das 18h às 23h ou fora de quarta a domingo. */
export function isDeliveryClosed(now: Date = new Date()): boolean {
  return !insideWindow(now, DELIVERY_CLOSE_MINUTE);
}

/** Loja fechada pro site (nem retirada): fora das 18h às 23:15 ou fora de quarta a domingo. */
export function isOrderingClosed(now: Date = new Date()): boolean {
  return !insideWindow(now, PICKUP_CLOSE_MINUTE);
}
