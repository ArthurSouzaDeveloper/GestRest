import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hashPassword } from '../../utils/auth';
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { auditService } from './audit.service';

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
};

// Papéis que um admin de restaurante pode atribuir (nunca SUPERADMIN).
const ASSIGNABLE_ROLES: Role[] = [
  Role.ADMIN,
  Role.MANAGER,
  Role.WAITER,
  Role.JUICER,
  Role.COOK,
  Role.CASHIER,
];

export const userService = {
  list(tenantId: string) {
    return prisma.user.findMany({
      where: { restaurantId: tenantId },
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
  },

  async create(
    tenantId: string,
    data: { name: string; email: string; password: string; role: Role },
    ctx?: { userId: string; ip?: string },
  ) {
    if (!ASSIGNABLE_ROLES.includes(data.role)) throw new ForbiddenError('Perfil inválido');
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictError('E-mail já cadastrado');

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: data.role,
        restaurantId: tenantId,
      },
      select: publicSelect,
    });

    await auditService.record({
      action: AuditAction.USER_CREATED,
      userId: ctx?.userId,
      restaurantId: tenantId,
      entity: 'User',
      entityId: user.id,
      ip: ctx?.ip,
    });
    return user;
  },

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; role: Role; active: boolean; password: string }>,
  ) {
    const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId } });
    if (!user) throw new NotFoundError('Usuário');
    if (data.role && !ASSIGNABLE_ROLES.includes(data.role)) {
      throw new ForbiddenError('Perfil inválido');
    }
    return prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        active: data.active,
        passwordHash: data.password ? await hashPassword(data.password) : undefined,
      },
      select: publicSelect,
    });
  },

  /**
   * Removes a user from the team. A user who already has orders/payments on
   * record is deactivated instead of hard-deleted — this preserves the
   * restaurant's order and financial history (deleting them would either
   * fail on a foreign-key constraint or silently erase past sales tied to
   * that person). Brand-new, never-used accounts are deleted outright.
   */
  async remove(tenantId: string, id: string, requesterId: string): Promise<{ deactivated: boolean }> {
    const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId } });
    if (!user) throw new NotFoundError('Usuário');
    if (id === requesterId) throw new ForbiddenError('Você não pode remover seu próprio usuário');

    if (user.role === Role.ADMIN) {
      const otherAdmins = await prisma.user.count({
        where: { restaurantId: tenantId, role: Role.ADMIN, id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new ConflictError('Não é possível remover o último administrador do restaurante');
      }
    }

    const [orderCount, paymentCount] = await Promise.all([
      prisma.order.count({ where: { waiterId: id } }),
      prisma.payment.count({ where: { cashierId: id } }),
    ]);

    if (orderCount === 0 && paymentCount === 0) {
      await prisma.user.delete({ where: { id } });
      return { deactivated: false };
    }
    await prisma.user.update({ where: { id }, data: { active: false } });
    return { deactivated: true };
  },
};
