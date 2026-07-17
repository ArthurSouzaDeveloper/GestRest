import { OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';

/**
 * Tempo-base (fila vazia) por tipo de pedido: retirada só soma preparo, delivery soma
 * preparo + deslocamento médio até o bairro. Valores fixos por enquanto — não existe hoje
 * um lugar de configuração por restaurante para isso; se o cliente pedir para ajustar,
 * vira uma coluna em Restaurant.
 */
const BASE_MINUTES: Record<'PICKUP' | 'DELIVERY', number> = {
  PICKUP: 20,
  DELIVERY: 40,
};

/**
 * Acréscimo em degraus conforme o número de pedidos ativos (mesa + online) que a cozinha/
 * suqueiro já têm em preparo neste momento — reflete a capacidade real da equipe, não só a
 * fila de pedidos online. Faixas ordenadas por limite crescente; a primeira cujo `upTo` cobre
 * a contagem atual vence.
 */
const QUEUE_TIERS: { upTo: number; extraMinutes: number }[] = [
  { upTo: 5, extraMinutes: 0 },
  { upTo: 10, extraMinutes: 15 },
  { upTo: 20, extraMinutes: 30 },
  { upTo: Infinity, extraMinutes: 45 },
];

function extraForQueue(activeCount: number): number {
  const tier = QUEUE_TIERS.find((t) => activeCount <= t.upTo);
  return tier ? tier.extraMinutes : QUEUE_TIERS[QUEUE_TIERS.length - 1].extraMinutes;
}

/** Pedidos que ainda ocupam capacidade da equipe: já aceitos e ainda não finalizados. */
async function countActiveOrders(restaurantId: string): Promise<number> {
  return prisma.order.count({
    where: {
      restaurantId,
      status: { in: [OrderStatus.OPEN, OrderStatus.IN_PRODUCTION] },
    },
  });
}

export interface EtaEstimate {
  minutes: number;
  activeOrders: number;
}

export const etaService = {
  extraForQueue,

  async estimate(restaurantId: string, orderType: 'PICKUP' | 'DELIVERY'): Promise<EtaEstimate> {
    const activeOrders = await countActiveOrders(restaurantId);
    const minutes = BASE_MINUTES[orderType] + extraForQueue(activeOrders);
    return { minutes, activeOrders };
  },
};
