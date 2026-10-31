import { useEffect, useState } from 'react';

/**
 * Horário de pedidos do site público — pedido explícito do dono (31/10/2026), no fuso do
 * restaurante (não no do servidor, que roda em UTC):
 *   - pedidos começam às 18h em ponto (entrega e retirada);
 *   - entrega até 23h (depois não tem motoboy rodando);
 *   - retirada até 23:15;
 *   - das 23:15 às 18h do dia seguinte o site não aceita pedido nenhum.
 * Os horários são em minutos desde a meia-noite. Pra mudar é só trocar as constantes aqui E
 * em backend/src/application/services/deliveryHours.ts (esta é a cópia que o site usa pra
 * travar os botões; a do backend é quem vale de verdade e recusa o pedido na API).
 */
export const DELIVERY_TIMEZONE = 'America/Sao_Paulo';
export const ORDERS_OPEN_MINUTE = 18 * 60; // 18:00
export const DELIVERY_CLOSE_MINUTE = 23 * 60; // 23:00
export const PICKUP_CLOSE_MINUTE = 23 * 60 + 15; // 23:15
export const DELIVERY_CLOSED_MESSAGE = 'Após as 23h, somente pedidos por retirada (até 23:15).';
export const ORDERS_CLOSED_MESSAGE = 'Fora do horário de pedidos. Aceitamos pedidos das 18h às 23:15 (entrega até 23h).';

/** Minutos desde a meia-noite (0-1439) no fuso do restaurante. */
function localMinute(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get('hour') * 60 + get('minute');
}

function insideWindow(now: Date, closeMinute: number): boolean {
  const minute = localMinute(now);
  return minute >= ORDERS_OPEN_MINUTE && minute < closeMinute;
}

/** Entrega fechada: fora das 18h às 23h. */
export function isDeliveryClosed(now: Date = new Date()): boolean {
  return !insideWindow(now, DELIVERY_CLOSE_MINUTE);
}

/** Loja fechada pro site (nem retirada): fora das 18h às 23:15. */
export function isOrderingClosed(now: Date = new Date()): boolean {
  return !insideWindow(now, PICKUP_CLOSE_MINUTE);
}

/**
 * Reavalia a cada 30s — o cliente pode estar com o site aberto quando bate 18h, 23h ou 23:15.
 * Também reavalia na hora em que o cliente volta pra aba: em segundo plano (principalmente no
 * celular) o navegador congela o setInterval, e sem isso uma aba aberta desde ontem mostraria
 * o botão liberado por alguns segundos (o backend recusaria de qualquer jeito).
 */
function useClockRule(rule: () => boolean): boolean {
  const [closed, setClosed] = useState(rule);
  useEffect(() => {
    const refresh = () => setClosed(rule());
    const id = setInterval(refresh, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [rule]);
  return closed;
}

export function useDeliveryClosed(): boolean {
  return useClockRule(isDeliveryClosed);
}

export function useOrderingClosed(): boolean {
  return useClockRule(isOrderingClosed);
}
