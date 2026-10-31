/**
 * Corte noturno da entrega no site público — pedido explícito do cliente/dono: depois das
 * 23h só sai pedido por retirada (não tem motoboy rodando). Vale da hora de corte até a
 * hora de volta, no fuso do restaurante (não no do servidor, que roda em UTC). Pra mudar o
 * horário é só trocar as constantes aqui E em frontend/src/lib/deliveryHours.ts (o site usa
 * a cópia de lá pra desabilitar o botão Entrega; esta aqui é a que vale de verdade).
 */
export const DELIVERY_CUTOFF_HOUR = 23;
export const DELIVERY_RESUME_HOUR = 6;
export const DELIVERY_TIMEZONE = 'America/Sao_Paulo';
export const DELIVERY_CLOSED_MESSAGE = 'Após as 23h, somente pedidos por retirada.';

/**
 * Abertura da loja no site público — pedido explícito do dono: só aceita pedido (entrega ou
 * retirada) a partir das 18h em ponto. Fecha de novo na hora de volta da entrega (6h), ou
 * seja, a janela de pedidos é 18h → 6h e das 6h às 18h a loja aparece fechada. Mesma regra
 * de "mudou aqui, muda em frontend/src/lib/deliveryHours.ts".
 */
export const ORDERS_OPEN_HOUR = 18;
export const ORDERS_CLOSED_MESSAGE = 'A loja ainda não abriu. Os pedidos começam às 18h.';

/** Hora local (0-23) no fuso do restaurante. */
function localHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: DELIVERY_TIMEZONE, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .find((p) => p.type === 'hour')?.value;
  return Number(hour);
}

export function isDeliveryClosed(now: Date = new Date()): boolean {
  const hour = localHour(now);
  return DELIVERY_CUTOFF_HOUR > DELIVERY_RESUME_HOUR
    ? hour >= DELIVERY_CUTOFF_HOUR || hour < DELIVERY_RESUME_HOUR
    : hour >= DELIVERY_CUTOFF_HOUR && hour < DELIVERY_RESUME_HOUR;
}

/** Fora do horário de pedidos (das 6h às 18h): o site não aceita pedido nenhum. */
export function isOrderingClosed(now: Date = new Date()): boolean {
  const hour = localHour(now);
  return hour >= DELIVERY_RESUME_HOUR && hour < ORDERS_OPEN_HOUR;
}
