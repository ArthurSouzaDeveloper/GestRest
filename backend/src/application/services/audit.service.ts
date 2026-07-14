import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

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
  /**
   * Records a business event both as a structured log line (for real-time observability/alerting)
   * and as a persisted AuditLog row (for the in-app audit trail). The DB write is best-effort: it
   * must never fail an already-committed operation (e.g. a payment) that just needs its audit trail
   * recorded — a failure here is logged, not thrown.
   */
  async record(input: AuditInput): Promise<void> {
    logger.info('audit_event', {
      action: input.action,
      userId: input.userId,
      tenantId: input.restaurantId,
      entity: input.entity,
      entityId: input.entityId,
      metadata: input.metadata,
    });

    try {
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
    } catch (err) {
      logger.error('audit_log_write_failed', {
        error: err,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
      });
    }
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
