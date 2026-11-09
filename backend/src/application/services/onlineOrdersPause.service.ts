import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { auditService } from './audit.service';
import { lastClosingKey } from './deliveryHours';

/** Recado padrão do site quando o restaurante pausa os pedidos sem escrever motivo. */
export const ONLINE_ORDERS_PAUSED_MESSAGE = 'Este restaurante não está aceitando pedidos online no momento.';

/** Texto que o cliente vê (site e recusa do backend): o motivo escrito pelo restaurante, ou o padrão. */
export function pausedMessage(reason: string | null | undefined): string {
  const r = reason?.trim();
  return r ? `${ONLINE_ORDERS_PAUSED_MESSAGE} ${r}` : ONLINE_ORDERS_PAUSED_MESSAGE;
}

const select = {
  onlineOrdersPaused: true,
  onlineOrdersPausedReason: true,
  onlineOrdersPausedAt: true,
  onlineOrdersPausedAuto: true,
  autoPauseAfterClose: true,
} as const;

type Row = {
  onlineOrdersPaused: boolean;
  onlineOrdersPausedReason: string | null;
  onlineOrdersPausedAt: Date | null;
  onlineOrdersPausedAuto: boolean;
  autoPauseAfterClose: boolean;
};
const view = (r: Row) => ({
  paused: r.onlineOrdersPaused,
  reason: r.onlineOrdersPausedReason,
  pausedAt: r.onlineOrdersPausedAt,
  /** A pausa atual foi a automática das 23:20 (não um clique de alguém). */
  pausedAutomatically: r.onlineOrdersPaused && r.onlineOrdersPausedAuto,
  autoPauseAfterClose: r.autoPauseAfterClose,
});

/**
 * Pausa dos pedidos online feita pelo próprio restaurante (ADMIN/MANAGER) — pra imprevisto
 * como falta de energia, sem precisar do superadmin. Só o site público para (ver
 * publicOrderService.createOrder); o restaurante continua `active`, a equipe continua logando
 * e mesa/caixa/cozinha seguem normais. Os horários fixos (deliveryHours.ts) continuam valendo
 * por cima: retomar fora do horário não abre a loja.
 *
 * Opcionalmente (autoPauseAfterClose), o sistema pausa sozinho todo dia às 23:20 e só volta
 * quando alguém clica em Retomar — ver sweep().
 */
export const onlineOrdersPauseService = {
  async get(tenantId: string) {
    return view(await prisma.restaurant.findUniqueOrThrow({ where: { id: tenantId }, select }));
  },

  async update(
    tenantId: string,
    data: { paused?: boolean; reason?: string | null; autoPauseAfterClose?: boolean },
    actor: { userId?: string; ip?: string },
    now: Date = new Date(),
  ) {
    const patch: Record<string, unknown> = {};
    if (data.paused !== undefined) {
      patch.onlineOrdersPaused = data.paused;
      patch.onlineOrdersPausedReason = data.paused ? data.reason?.trim() || null : null;
      patch.onlineOrdersPausedAt = data.paused ? now : null;
      patch.onlineOrdersPausedAuto = false;
    }
    if (data.autoPauseAfterClose !== undefined) {
      patch.autoPauseAfterClose = data.autoPauseAfterClose;
      // Ligar não pausa na hora por causa de uma noite que já passou: conta a partir do
      // próximo fechamento das 23:20.
      if (data.autoPauseAfterClose) patch.onlineOrdersAutoPausedOn = lastClosingKey(now);
    }
    const r = await prisma.restaurant.update({ where: { id: tenantId }, data: patch, select });
    await auditService.record({
      action: AuditAction.ONLINE_ORDERS_PAUSE_CHANGED,
      userId: actor.userId,
      restaurantId: tenantId,
      entity: 'Restaurant',
      entityId: tenantId,
      ip: actor.ip,
      metadata: { ...data, reason: r.onlineOrdersPausedReason },
    });
    return view(r);
  },

  /**
   * Pausa automática ao fechar: pra cada restaurante com a opção ligada, se o fechamento das
   * 23:20 mais recente ainda não foi aplicado, pausa (sem recado, marcado como automático) e
   * anota o dia. Quem retomar depois disso (na mesma noite ou no dia seguinte) não é pausado
   * de novo até o próximo 23:20. Se já estava pausado à mão, mantém o recado e só anota o dia.
   * Chamado a cada minuto pelo setInterval de server.ts; `restaurantId` restringe (testes).
   */
  async sweep(opts: { restaurantId?: string; now?: Date } = {}): Promise<void> {
    const now = opts.now ?? new Date();
    const key = lastClosingKey(now);
    const due = await prisma.restaurant.findMany({
      where: {
        autoPauseAfterClose: true,
        active: true,
        OR: [{ onlineOrdersAutoPausedOn: null }, { onlineOrdersAutoPausedOn: { not: key } }],
        ...(opts.restaurantId ? { id: opts.restaurantId } : {}),
      },
      select: { id: true, onlineOrdersPaused: true },
    });
    for (const r of due) {
      // updateMany com a mesma condição: se duas instâncias rodarem juntas, só uma pausa.
      const { count } = await prisma.restaurant.updateMany({
        where: { id: r.id, OR: [{ onlineOrdersAutoPausedOn: null }, { onlineOrdersAutoPausedOn: { not: key } }] },
        data: r.onlineOrdersPaused
          ? { onlineOrdersAutoPausedOn: key }
          : {
              onlineOrdersAutoPausedOn: key,
              onlineOrdersPaused: true,
              onlineOrdersPausedReason: null,
              onlineOrdersPausedAt: now,
              onlineOrdersPausedAuto: true,
            },
      });
      if (count && !r.onlineOrdersPaused) {
        logger.info('online_orders_auto_paused', { tenantId: r.id, closing: key });
        await auditService.record({
          action: AuditAction.ONLINE_ORDERS_PAUSE_CHANGED,
          restaurantId: r.id,
          entity: 'Restaurant',
          entityId: r.id,
          metadata: { paused: true, automatic: true, closing: key },
        });
      }
    }
  },
};
