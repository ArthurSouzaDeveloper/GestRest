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
  Role.MOTOBOY,
];

export const userService = {
  list(tenantId: string) {
    return prisma.user.findMany({
      where: { restaurantId: tenantId, deletedAt: null },
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
  },

  /** Usuários arquivados (excluídos da equipe), disponíveis para reativação. */
  listDeleted(tenantId: string) {
    return prisma.user.findMany({
      where: { restaurantId: tenantId, deletedAt: { not: null } },
      select: { ...publicSelect, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    });
  },

  async create(
    tenantId: string,
    data: { name: string; email: string; password: string; role: Role },
    requester: { userId: string; role: Role; ip?: string },
  ) {
    if (!ASSIGNABLE_ROLES.includes(data.role)) throw new ForbiddenError('Perfil inválido');

    // Mesma regra de update(): só um ADMIN cria outro ADMIN — sem isso, um MANAGER
    // (que também tem acesso a este endpoint) podia criar uma conta ADMIN pra si mesmo
    // e assumir o tenant inteiro (achado de auditoria de segurança).
    if (data.role === Role.ADMIN && requester.role !== Role.ADMIN) {
      throw new ForbiddenError('Só um administrador pode criar outro administrador');
    }

    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) {
      // O cadastro arquivado continua ocupando o e-mail: avisar onde reativá-lo, em vez
      // de deixar o admin travado num "e-mail já cadastrado" sem usuário visível na lista.
      if (exists.deletedAt && exists.restaurantId === tenantId) {
        throw new ConflictError(
          'Este e-mail pertence a um usuário excluído. Reative-o em "Usuários excluídos".',
        );
      }
      throw new ConflictError('E-mail já cadastrado');
    }

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
      userId: requester.userId,
      restaurantId: tenantId,
      entity: 'User',
      entityId: user.id,
      ip: requester.ip,
    });
    return user;
  },

  async update(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; role: Role; active: boolean; password: string }>,
    requester: { userId: string; role: Role; ip?: string },
  ) {
    const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId, deletedAt: null } });
    if (!user) throw new NotFoundError('Usuário');
    if (data.role && !ASSIGNABLE_ROLES.includes(data.role)) {
      throw new ForbiddenError('Perfil inválido');
    }

    // Ninguém altera o próprio perfil — sem isso, um MANAGER podia chamar essa mesma rota
    // no próprio id com { role: 'ADMIN' } e se autopromover.
    if (id === requester.userId && data.role && data.role !== user.role) {
      throw new ForbiddenError('Você não pode alterar seu próprio perfil');
    }

    // Só um ADMIN mexe em outro ADMIN (elevar alguém a ADMIN, resetar senha dele ou
    // desativá-lo) — um MANAGER fazendo isso seria sequestro/nocaute de conta de nível
    // mais alto sem precisar saber a senha antiga.
    const touchesAdmin = user.role === Role.ADMIN || data.role === Role.ADMIN;
    if (touchesAdmin && requester.role !== Role.ADMIN) {
      throw new ForbiddenError('Só um administrador pode alterar outro administrador');
    }

    // Mesma proteção que remove() já tem: nunca deixar o tenant sem nenhum admin ativo,
    // seja desativando o último ou rebaixando o último a outro perfil.
    const losesAdminStatus =
      user.role === Role.ADMIN && (data.active === false || (data.role !== undefined && data.role !== Role.ADMIN));
    if (losesAdminStatus) {
      const otherActiveAdmins = await prisma.user.count({
        where: { restaurantId: tenantId, role: Role.ADMIN, active: true, deletedAt: null, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new ConflictError('Não é possível remover o último administrador ativo do restaurante');
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        active: data.active,
        passwordHash: data.password ? await hashPassword(data.password) : undefined,
      },
      select: publicSelect,
    });

    // Desativar precisa derrubar as sessões abertas, senão o refresh token continuaria
    // renovando o acesso de alguém que já saiu da equipe.
    if (data.active === false) {
      await prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } });
    }

    await auditService.record({
      action: AuditAction.USER_UPDATED,
      userId: requester.userId,
      restaurantId: tenantId,
      entity: 'User',
      entityId: id,
      ip: requester.ip,
      metadata: {
        // Nunca a senha em si — só que ela foi trocada, e os outros campos alterados.
        changed: Object.keys(data).map((k) => (k === 'password' ? 'password' : k)),
        newRole: data.role,
        newActive: data.active,
      },
    });

    return updated;
  },

  /**
   * Arquiva um usuário (exclusão da equipe). O cadastro NUNCA é apagado do banco:
   * ele sai da lista da equipe, perde o acesso, e fica guardado em "Usuários
   * excluídos" para ser reativado depois — preservando o histórico de pedidos e
   * pagamentos ligado a essa pessoa.
   */
  async remove(
    tenantId: string,
    id: string,
    requester: { userId: string; role: Role; ip?: string },
  ): Promise<{ deactivated: boolean }> {
    const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId, deletedAt: null } });
    if (!user) throw new NotFoundError('Usuário');
    if (id === requester.userId) throw new ForbiddenError('Você não pode remover seu próprio usuário');

    // Mesma regra de update()/create(): só um ADMIN remove outro ADMIN — sem isso, um
    // MANAGER podia derrubar o admin de verdade depois de criar um pra si (achado de
    // auditoria de segurança).
    if (user.role === Role.ADMIN && requester.role !== Role.ADMIN) {
      throw new ForbiddenError('Só um administrador pode remover outro administrador');
    }

    if (user.role === Role.ADMIN) {
      const otherAdmins = await prisma.user.count({
        where: { restaurantId: tenantId, role: Role.ADMIN, active: true, deletedAt: null, id: { not: id } },
      });
      if (otherAdmins === 0) {
        throw new ConflictError('Não é possível remover o último administrador do restaurante');
      }
    }

    await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    // Sem isso, um refresh token válido seguiria renovando o acesso de quem saiu.
    await prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } });

    await auditService.record({
      action: AuditAction.USER_REMOVED,
      userId: requester.userId,
      restaurantId: tenantId,
      entity: 'User',
      entityId: id,
      ip: requester.ip,
      metadata: { archived: true, role: user.role },
    });

    // deactivated: true — nenhum usuário é apagado de vez; o campo fica por
    // compatibilidade com quem já consome esta resposta.
    return { deactivated: true };
  },

  /** Traz um usuário arquivado de volta para a equipe, ativo. */
  async restore(
    tenantId: string,
    id: string,
    requester: { userId: string; role: Role; ip?: string },
  ) {
    const user = await prisma.user.findFirst({
      where: { id, restaurantId: tenantId, deletedAt: { not: null } },
    });
    if (!user) throw new NotFoundError('Usuário excluído');

    // Mesma regra do resto do serviço: conta de ADMIN só volta pela mão de um ADMIN.
    if (user.role === Role.ADMIN && requester.role !== Role.ADMIN) {
      throw new ForbiddenError('Só um administrador pode reativar outro administrador');
    }

    const restored = await prisma.user.update({
      where: { id },
      data: { active: true, deletedAt: null },
      select: publicSelect,
    });

    await auditService.record({
      action: AuditAction.USER_RESTORED,
      userId: requester.userId,
      restaurantId: tenantId,
      entity: 'User',
      entityId: id,
      ip: requester.ip,
      metadata: { role: user.role },
    });

    return restored;
  },
};
