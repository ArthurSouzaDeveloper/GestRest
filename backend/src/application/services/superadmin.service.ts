import { AuditAction, Role, Station } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hashPassword } from '../../utils/auth';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { auditService } from './audit.service';

/** Categorias iniciais criadas em todo restaurante novo (o cardápio é montado depois). */
const STARTER_CATEGORIES: { name: string; station: Station; sortOrder: number }[] = [
  { name: 'Sucos', station: Station.JUICE_BAR, sortOrder: 1 },
  { name: 'Refrigerantes', station: Station.JUICE_BAR, sortOrder: 2 },
  { name: 'Água', station: Station.JUICE_BAR, sortOrder: 3 },
  { name: 'Pastéis', station: Station.KITCHEN, sortOrder: 4 },
  { name: 'Mini Pizzas', station: Station.KITCHEN, sortOrder: 5 },
  { name: 'Sobremesas', station: Station.KITCHEN, sortOrder: 6 },
  { name: 'Outros', station: Station.NONE, sortOrder: 7 },
];

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const superadminService = {
  async listRestaurants() {
    const restaurants = await prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, orders: true, products: true } } },
    });
    return restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      active: r.active,
      createdAt: r.createdAt,
      counts: { users: r._count.users, orders: r._count.orders, products: r._count.products },
    }));
  },

  async createRestaurant(
    input: {
      name: string;
      slug?: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      tablesCount?: number;
    },
    actor: { userId: string; ip?: string },
  ) {
    const slug = normalizeSlug(input.slug || input.name);
    if (!slug) throw new ConflictError('Slug inválido');

    const [slugTaken, emailTaken] = await Promise.all([
      prisma.restaurant.findUnique({ where: { slug } }),
      prisma.user.findUnique({ where: { email: input.adminEmail } }),
    ]);
    if (slugTaken) throw new ConflictError('Já existe um restaurante com esse link (slug)');
    if (emailTaken) throw new ConflictError('E-mail do administrador já cadastrado');

    const tablesCount = Math.min(Math.max(input.tablesCount ?? 10, 1), 100);
    const passwordHash = await hashPassword(input.adminPassword);

    const restaurant = await prisma.$transaction(async (tx) => {
      const created = await tx.restaurant.create({ data: { name: input.name, slug } });
      await tx.user.create({
        data: {
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          role: Role.ADMIN,
          restaurantId: created.id,
        },
      });
      await tx.category.createMany({
        data: STARTER_CATEGORIES.map((c) => ({ ...c, restaurantId: created.id })),
      });
      await tx.restaurantTable.createMany({
        data: Array.from({ length: tablesCount }, (_, i) => ({
          number: i + 1,
          seats: 4,
          restaurantId: created.id,
        })),
      });
      return created;
    });

    await auditService.record({
      action: AuditAction.RESTAURANT_CREATED,
      userId: actor.userId,
      restaurantId: restaurant.id,
      entity: 'Restaurant',
      entityId: restaurant.id,
      ip: actor.ip,
      metadata: { slug },
    });

    return { id: restaurant.id, name: restaurant.name, slug: restaurant.slug };
  },

  /** Apaga o restaurante e todos os seus dados (cardápio, pedidos, equipe, etc). */
  async removeRestaurant(id: string, actor: { userId: string; ip?: string }) {
    const r = await prisma.restaurant.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Restaurante');
    await prisma.restaurant.delete({ where: { id } });
    // Sem restaurantId aqui de propósito: o restaurante (e o próprio AuditLog dele, via
    // onDelete: Cascade) acabou de ser apagado — este evento fica só no log da plataforma.
    await auditService.record({
      action: AuditAction.RESTAURANT_REMOVED,
      userId: actor.userId,
      entity: 'Restaurant',
      entityId: id,
      ip: actor.ip,
      metadata: { name: r.name, slug: r.slug },
    });
  },

  async setActive(id: string, active: boolean, actor: { userId: string; ip?: string }) {
    const r = await prisma.restaurant.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Restaurante');
    const updated = await prisma.restaurant.update({
      where: { id },
      data: { active },
      select: { id: true, name: true, slug: true, active: true },
    });
    await auditService.record({
      action: AuditAction.RESTAURANT_STATUS_CHANGED,
      userId: actor.userId,
      restaurantId: id,
      entity: 'Restaurant',
      entityId: id,
      ip: actor.ip,
      metadata: { active },
    });
    return updated;
  },

  /**
   * Público: usado pela tela de login "com marca" do restaurante (por slug) e pelo site
   * de pedidos, que lê brandColor/logoUrl daqui pra retemar a própria cor (ver
   * branding.service.ts e lib/publicBrand.ts no front).
   */
  async publicBySlug(slug: string) {
    const r = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        name: true,
        slug: true,
        active: true,
        deliveryPricingMode: true,
        brandColor: true,
        logoUrl: true,
      },
    });
    if (!r) throw new NotFoundError('Restaurante');
    return r;
  },
};
