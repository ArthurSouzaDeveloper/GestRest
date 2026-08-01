import { EtaMode, OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';

/**
 * Tempo-base (fila vazia) por tipo de pedido no modo automático: retirada só soma preparo,
 * delivery soma preparo + deslocamento médio até o bairro. Só vale quando
 * Restaurant.etaMode = AUTO — no modo MANUAL, quem define o tempo é o admin (ver
 * etaSettingsService), sem esse cálculo por fila entrar em jogo.
 */
const BASE_MINUTES: Record<'PICKUP' | 'DELIVERY', number> = {
  PICKUP: 30,
  DELIVERY: 45,
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
  mode: EtaMode;
}

export const etaService = {
  extraForQueue,

  async estimate(restaurantId: string, orderType: 'PICKUP' | 'DELIVERY'): Promise<EtaEstimate> {
    const [activeOrders, restaurant] = await Promise.all([
      countActiveOrders(restaurantId),
      prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { etaMode: true, etaPickupMinutes: true, etaDeliveryMinutes: true },
      }),
    ]);

    if (restaurant.etaMode === EtaMode.MANUAL) {
      const manualMinutes = orderType === 'PICKUP' ? restaurant.etaPickupMinutes : restaurant.etaDeliveryMinutes;
      // Fallback pro valor automático se o admin ligou o modo manual sem preencher os dois
      // tempos (não deveria acontecer — etaSettingsService.update exige os dois — mas evita
      // devolver minutes: null pro cliente se algum dado antigo escapar dessa validação).
      const minutes = manualMinutes ?? BASE_MINUTES[orderType] + extraForQueue(activeOrders);
      return { minutes, activeOrders, mode: EtaMode.MANUAL };
    }

    const minutes = BASE_MINUTES[orderType] + extraForQueue(activeOrders);
    return { minutes, activeOrders, mode: EtaMode.AUTO };
  },
};

/**
 * Liga/desliga o ajuste automático por fila e guarda os minutos fixos do modo manual —
 * espelha o padrão de deliveryPricingSettingsService (config direto em Restaurant, sem
 * tabela própria). Escrita restrita a Role.ADMIN em catalog.routes.ts — pedido explícito do
 * cliente Rei do Suco, que quer decidir o horário ele mesmo olhando o fluxo da cozinha, sem
 * o ajuste automático por fila entrando no meio, e só confiar isso a administradores.
 */
export const etaSettingsService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { etaMode: true, etaPickupMinutes: true, etaDeliveryMinutes: true },
    });
    return { mode: r.etaMode, pickupMinutes: r.etaPickupMinutes, deliveryMinutes: r.etaDeliveryMinutes };
  },

  async update(
    tenantId: string,
    data: { mode: EtaMode; pickupMinutes?: number; deliveryMinutes?: number },
  ) {
    if (data.mode === EtaMode.MANUAL) {
      // Mesma lógica do frete por distância: ligar o modo manual é uma ação separada de
      // preencher os tempos, então considera o que já está salvo se o corpo não reenviar.
      const current = await prisma.restaurant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { etaPickupMinutes: true, etaDeliveryMinutes: true },
      });
      const pickup = data.pickupMinutes ?? current.etaPickupMinutes;
      const delivery = data.deliveryMinutes ?? current.etaDeliveryMinutes;
      if (pickup == null || delivery == null) {
        throw new AppError('Informe o tempo de retirada e de entrega para ativar o modo manual');
      }
    }

    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: {
        etaMode: data.mode,
        etaPickupMinutes: data.pickupMinutes,
        etaDeliveryMinutes: data.deliveryMinutes,
      },
      select: { etaMode: true, etaPickupMinutes: true, etaDeliveryMinutes: true },
    });
    return { mode: r.etaMode, pickupMinutes: r.etaPickupMinutes, deliveryMinutes: r.etaDeliveryMinutes };
  },
};
