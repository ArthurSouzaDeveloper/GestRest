import { useEffect, useState } from 'react';

/**
 * Cópia do corte noturno da entrega (ver backend/src/application/services/deliveryHours.ts,
 * que é quem vale de verdade e recusa o pedido) — aqui só serve pra desabilitar o botão
 * Entrega e mostrar o recado antes do cliente montar o pedido. Mudou o horário lá, muda aqui.
 */
export const DELIVERY_CUTOFF_HOUR = 23;
export const DELIVERY_RESUME_HOUR = 6;
export const DELIVERY_TIMEZONE = 'America/Sao_Paulo';
export const DELIVERY_CLOSED_MESSAGE = 'Após as 23h, somente pedidos por retirada.';

/** Abertura da loja (18h) — fechada das 6h às 18h. Cópia de backend/.../deliveryHours.ts. */
export const ORDERS_OPEN_HOUR = 18;
export const ORDERS_CLOSED_MESSAGE = 'A loja ainda não abriu. Os pedidos começam às 18h.';

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

export function isOrderingClosed(now: Date = new Date()): boolean {
  const hour = localHour(now);
  return hour >= DELIVERY_RESUME_HOUR && hour < ORDERS_OPEN_HOUR;
}

/** Reavalia a cada 30s — o cliente pode estar com o site aberto quando bate 18h ou 23h. */
function useClockRule(rule: () => boolean): boolean {
  const [closed, setClosed] = useState(rule);
  useEffect(() => {
    const id = setInterval(() => setClosed(rule()), 30_000);
    return () => clearInterval(id);
  }, [rule]);
  return closed;
}

export function useDeliveryClosed(): boolean {
  return useClockRule(isDeliveryClosed);
}

export function useOrderingClosed(): boolean {
  return useClockRule(isOrderingClosed);
}
