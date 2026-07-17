import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { additionalService, categoryService, deliveryZoneService, productService } from './catalog.service';

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
};
