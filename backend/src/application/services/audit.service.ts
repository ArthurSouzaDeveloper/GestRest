import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  restaurantId?: string | null;
  entity?: string;
  entityId?: string;
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}

export const auditService = {
  async record(input: AuditInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        restaurantId: input.restaurantId ?? null,
        entity: input.entity,
        entityId: input.entityId,
        ip: input.ip,
        metadata: input.metadata,
      },
    });
  },

  list(params: { tenantId: string; skip?: number; take?: number }) {
    return prisma.auditLog.findMany({
      where: { restaurantId: params.tenantId },
      orderBy: { createdAt: 'desc' },
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      include: { user: { select: { name: true, role: true } } },
    });
  },
};
