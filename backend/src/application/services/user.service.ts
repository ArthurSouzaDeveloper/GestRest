import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hashPassword } from '../../utils/auth';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { auditService } from './audit.service';

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
};

export const userService = {
  list() {
    return prisma.user.findMany({ select: publicSelect, orderBy: { name: 'asc' } });
  },

  async create(
    data: { name: string; email: string; password: string; role: Role },
    ctx?: { userId: string; ip?: string },
  ) {
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new ConflictError('E-mail já cadastrado');

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: data.role,
      },
      select: publicSelect,
    });

    await auditService.record({
      action: AuditAction.USER_CREATED,
      userId: ctx?.userId,
      entity: 'User',
      entityId: user.id,
      ip: ctx?.ip,
    });
    return user;
  },

  async update(
    id: string,
    data: Partial<{ name: string; role: Role; active: boolean; password: string }>,
  ) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('Usuário');
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
};
