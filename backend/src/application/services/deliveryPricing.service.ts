import { DeliveryPricingMode, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError, NotFoundError } from '../../utils/errors';
import { googleMapsClient } from './googleMaps.client';

function serializeBand<T extends { maxDistanceKm: Prisma.Decimal | number; fee: Prisma.Decimal | number }>(b: T) {
  return { ...b, maxDistanceKm: Number(b.maxDistanceKm), fee: Number(b.fee) };
}

export interface DistanceBandInput {
  maxDistanceKm: number;
  fee: number;
  active?: boolean;
}

/**
 * Resolve qual faixa cobre uma distância — pura, sem I/O, fácil de testar isolada da
 * chamada ao Google/banco. `bands` deve vir só com as ativas; a ordem de entrada não
 * importa, a função ordena por conta própria. Retorna undefined se nenhuma faixa cobre
 * (endereço fora da área de entrega).
 */
export function resolveBand<T extends { maxDistanceKm: number }>(bands: T[], distanceKm: number): T | undefined {
  return [...bands].sort((a, b) => a.maxDistanceKm - b.maxDistanceKm).find((b) => distanceKm <= b.maxDistanceKm);
}

export const deliveryPricingBandService = {
  async list(tenantId: string, params: { onlyActive?: boolean } = {}) {
    const where: Prisma.DeliveryDistanceBandWhereInput = { restaurantId: tenantId };
    if (params.onlyActive) where.active = true;
    const bands = await prisma.deliveryDistanceBand.findMany({ where, orderBy: { maxDistanceKm: 'asc' } });
    return bands.map(serializeBand);
  },
  async create(tenantId: string, data: DistanceBandInput) {
    const b = await prisma.deliveryDistanceBand.create({ data: { ...data, restaurantId: tenantId } });
    return serializeBand(b);
  },
  async update(tenantId: string, id: string, data: Partial<DistanceBandInput>) {
    await deliveryPricingBandService.ensure(tenantId, id);
    const b = await prisma.deliveryDistanceBand.update({ where: { id }, data });
    return serializeBand(b);
  },
  async remove(tenantId: string, id: string) {
    await deliveryPricingBandService.ensure(tenantId, id);
    return prisma.deliveryDistanceBand.delete({ where: { id } });
  },
  async ensure(tenantId: string, id: string) {
    const b = await prisma.deliveryDistanceBand.findFirst({ where: { id, restaurantId: tenantId } });
    if (!b) throw new NotFoundError('Faixa de distância');
    return b;
  },
};

export const deliveryPricingSettingsService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        deliveryPricingMode: true,
        deliveryOriginAddress: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
      },
    });
    return {
      mode: r.deliveryPricingMode,
      originAddress: r.deliveryOriginAddress,
      originLat: r.deliveryOriginLat !== null ? Number(r.deliveryOriginLat) : null,
      originLng: r.deliveryOriginLng !== null ? Number(r.deliveryOriginLng) : null,
    };
  },
  async update(
    tenantId: string,
    data: { mode: DeliveryPricingMode; originAddress?: string; originLat?: number; originLng?: number },
  ) {
    // Ativar o modo por distância é uma ação separada de configurar a origem (ver
    // DeliveryZones.tsx) — o PATCH que liga o modo normalmente não reenvia lat/lng, então a
    // validação precisa considerar o que já está salvo no banco, não só o corpo da
    // requisição (senão nunca dá pra reativar sem reenviar o endereço de origem de novo).
    if (data.mode === DeliveryPricingMode.DISTANCE_BANDS && (data.originLat === undefined || data.originLng === undefined)) {
      const current = await prisma.restaurant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { deliveryOriginLat: true, deliveryOriginLng: true },
      });
      if (current.deliveryOriginLat === null || current.deliveryOriginLng === null) {
        throw new AppError('Endereço de origem é obrigatório para ativar o modo por distância');
      }
    }
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: {
        deliveryPricingMode: data.mode,
        deliveryOriginAddress: data.originAddress,
        deliveryOriginLat: data.originLat,
        deliveryOriginLng: data.originLng,
      },
      select: {
        deliveryPricingMode: true,
        deliveryOriginAddress: true,
        deliveryOriginLat: true,
        deliveryOriginLng: true,
      },
    });
    return {
      mode: r.deliveryPricingMode,
      originAddress: r.deliveryOriginAddress,
      originLat: r.deliveryOriginLat !== null ? Number(r.deliveryOriginLat) : null,
      originLng: r.deliveryOriginLng !== null ? Number(r.deliveryOriginLng) : null,
    };
  },
};

/**
 * Cotação de frete por distância — chamada tanto pra pré-visualizar (GET /delivery-quote)
 * quanto, de novo, no momento de confirmar o pedido (openPublic), pra nunca confiar num
 * valor que o cliente tenha visto antes. Sempre recalcula a distância de verdade via
 * Google — nunca aceita distância vinda do cliente.
 */
export const deliveryPricingService = {
  async quote(tenantId: string, destination: { lat: number; lng: number }) {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { deliveryPricingMode: true, deliveryOriginLat: true, deliveryOriginLng: true },
    });
    if (restaurant.deliveryPricingMode !== DeliveryPricingMode.DISTANCE_BANDS) {
      throw new AppError('Este restaurante não usa entrega por distância');
    }
    if (restaurant.deliveryOriginLat === null || restaurant.deliveryOriginLng === null) {
      throw new AppError('Endereço de origem do restaurante não configurado');
    }

    const distanceKm = await googleMapsClient.distanceKm(
      { lat: Number(restaurant.deliveryOriginLat), lng: Number(restaurant.deliveryOriginLng) },
      destination,
    );

    const bands = await deliveryPricingBandService.list(tenantId, { onlyActive: true });
    const band = resolveBand(bands, distanceKm);
    if (!band) throw new AppError('Este endereço está fora da nossa área de entrega', 400, 'OUT_OF_RANGE');

    return { fee: band.fee, distanceKm };
  },
};
