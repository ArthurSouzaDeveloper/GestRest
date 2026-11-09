import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { auditService } from './audit.service';

/** Recado padrão do site quando o restaurante pausa os pedidos sem escrever motivo. */
export const ONLINE_ORDERS_PAUSED_MESSAGE = 'Este restaurante não está aceitando pedidos online no momento.';

/** Texto que o cliente vê (site e recusa do backend): o motivo escrito pelo restaurante, ou o padrão. */
export function pausedMessage(reason: string | null | undefined): string {
  const r = reason?.trim();
  return r ? `${ONLINE_ORDERS_PAUSED_MESSAGE} ${r}` : ONLINE_ORDERS_PAUSED_MESSAGE;
}

const select = { onlineOrdersPaused: true, onlineOrdersPausedReason: true, onlineOrdersPausedAt: true } as const;

type Row = { onlineOrdersPaused: boolean; onlineOrdersPausedReason: string | null; onlineOrdersPausedAt: Date | null };
const view = (r: Row) => ({ paused: r.onlineOrdersPaused, reason: r.onlineOrdersPausedReason, pausedAt: r.onlineOrdersPausedAt });

/**
 * Pausa dos pedidos online feita pelo próprio restaurante (ADMIN/MANAGER) — pra imprevisto
 * como falta de energia, sem precisar do superadmin. Só o site público para (ver
 * publicOrderService.createOrder); o restaurante continua `active`, a equipe continua logando
 * e mesa/caixa/cozinha seguem normais. Os horários fixos (deliveryHours.ts) continuam valendo
 * por cima: retomar fora do horário não abre a loja.
 */
export const onlineOrdersPauseService = {
  async get(tenantId: string) {
    return view(await prisma.restaurant.findUniqueOrThrow({ where: { id: tenantId }, select }));
  },

  async update(
    tenantId: string,
    data: { paused: boolean; reason?: string | null },
    actor: { userId?: string; ip?: string },
  ) {
    const reason = data.paused ? data.reason?.trim() || null : null;
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: {
        onlineOrdersPaused: data.paused,
        onlineOrdersPausedReason: reason,
        onlineOrdersPausedAt: data.paused ? new Date() : null,
      },
      select,
    });
    await auditService.record({
      action: AuditAction.ONLINE_ORDERS_PAUSE_CHANGED,
      userId: actor.userId,
      restaurantId: tenantId,
      entity: 'Restaurant',
      entityId: tenantId,
      ip: actor.ip,
      metadata: { paused: data.paused, reason },
    });
    return view(r);
  },
};
