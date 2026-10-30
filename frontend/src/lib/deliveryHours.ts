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

/** Reavalia a cada 30s — o cliente pode estar com o site aberto quando bate 23h. */
export function useDeliveryClosed(): boolean {
  const [closed, setClosed] = useState(() => isDeliveryClosed());
  useEffect(() => {
    const id = setInterval(() => setClosed(isDeliveryClosed()), 30_000);
    return () => clearInterval(id);
  }, []);
  return closed;
}
