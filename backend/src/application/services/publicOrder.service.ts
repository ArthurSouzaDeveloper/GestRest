import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { additionalService, categoryService, deliveryZoneService, productService } from './catalog.service';
import { deliveryPricingService } from './deliveryPricing.service';
import { etaService } from './eta.service';
import { googleMapsClient } from './googleMaps.client';
import { orderInclude, serializePublicStatus } from './order.helpers';
import { orderService, type PublicOrderInput } from './order.service';

/** Resolves a public :slug to a tenant id, rejecting unknown or inactive restaurants. */
async function resolveActiveTenant(slug: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, active: true },
  });
  if (!restaurant) throw new NotFoundError('Restaurante');
  if (!restaurant.active) throw new ForbiddenError('Restaurante inativo');
  return restaurant.id;
}

/**
 * Read-only catalog/config access for the public ordering site — no auth, resolved by
 * :slug instead of a JWT's restaurantId. Delegates straight to the same services the
 * staff app uses, forcing the "only what a customer should see" filters server-side
 * (available products, active additionals/zones) so the client can't override them.
 */
export const publicOrderService = {
  async categories(slug: string) {
    const tenantId = await resolveActiveTenant(slug);
    return categoryService.list(tenantId);
  },
  async products(slug: string) {
    const tenantId = await resolveActiveTenant(slug);
    return productService.list(tenantId, { onlyAvailable: true });
  },
  async additionals(slug: string, categoryId?: string) {
    const tenantId = await resolveActiveTenant(slug);
    return additionalService.list(tenantId, { categoryId, onlyActive: true });
  },
  async deliveryZones(slug: string) {
    const tenantId = await resolveActiveTenant(slug);
    return deliveryZoneService.list(tenantId, { onlyActive: true });
  },
  /** Live estimate shown while the customer is still browsing/reviewing — not locked in yet. */
  async eta(slug: string, orderType: 'PICKUP' | 'DELIVERY') {
    const tenantId = await resolveActiveTenant(slug);
    return etaService.estimate(tenantId, orderType);
  },
  async createOrder(slug: string, input: PublicOrderInput, ip?: string) {
    const tenantId = await resolveActiveTenant(slug);
    return orderService.openPublic(tenantId, input, ip);
  },
  /** Autocomplete/detalhes de endereço (modo por distância) — proxy pro Google, chave nunca sai do backend. */
  async placesAutocomplete(slug: string, input: string, sessionToken: string) {
    await resolveActiveTenant(slug);
    return googleMapsClient.autocompleteAddress(input, sessionToken);
  },
  async placeDetails(slug: string, placeId: string, sessionToken: string) {
    await resolveActiveTenant(slug);
    return googleMapsClient.getPlaceDetails(placeId, sessionToken);
  },
  /** Pré-visualização do frete (modo por distância) — reconferida de novo em createOrder(). */
  async deliveryQuote(slug: string, destination: { lat: number; lng: number }) {
    const tenantId = await resolveActiveTenant(slug);
    return deliveryPricingService.quote(tenantId, destination);
  },
  /**
   * Link de acompanhamento — o id do pedido (UUID, não-adivinhável) já autoriza o acesso,
   * sem precisar de login. Escopado por slug+id juntos pra um id de outro tenant nunca vazar.
   */
  async orderStatus(slug: string, orderId: string) {
    const tenantId = await resolveActiveTenant(slug);
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: tenantId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError('Pedido');
    return serializePublicStatus(order);
  },
};
