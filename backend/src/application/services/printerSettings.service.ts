import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { AuditAction, PrintJobStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { hashPassword } from '../../utils/auth';
import { auditService } from './audit.service';

/**
 * Confere uma chave de ponte de impressão (formato `<restaurantId>.<segredo>`) e
 * devolve o id do restaurante se válida, ou null. Compartilhado entre a autenticação
 * HTTP (printerAgent.middleware.ts) e a autenticação de socket (socket/index.ts) —
 * a mesma chave serve pros dois, nunca duplicar a lógica de conferência.
 */
export async function verifyAgentKey(key: string): Promise<string | null> {
  const dot = key.indexOf('.');
  if (dot <= 0) return null;
  const restaurantId = key.slice(0, dot);
  const secret = key.slice(dot + 1);
  if (!secret) return null;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, printerAgentKeyHash: true },
  });
  if (!restaurant?.printerAgentKeyHash) return null;

  const ok = await bcrypt.compare(secret, restaurant.printerAgentKeyHash);
  return ok ? restaurant.id : null;
}

/** Minutos sem confirmação de impressão a partir dos quais um PrintJob conta como "preso"
 * pro alerta em GET /catalog/printer-status — tempo generoso o bastante pra não disparar
 * falso alarme num pico normal de pedidos, curto o bastante pra avisar antes do fim do
 * expediente se a ponte/impressora parou de responder. */
const STUCK_JOB_MINUTES = 15;

export const printerSettingsService = {
  async getConnection(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { printerHost: true, printerPort: true, printerAgentKeyHash: true },
    });
    return {
      printerHost: r.printerHost,
      printerPort: r.printerPort,
      // Nunca devolve o hash — só se já existe uma chave gerada, pro front saber se
      // mostra "gerar chave" ou "regenerar chave".
      agentKeyConfigured: r.printerAgentKeyHash !== null,
    };
  },

  async updateConnection(tenantId: string, data: { printerHost?: string; printerPort?: number }) {
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { printerHost: data.printerHost, printerPort: data.printerPort },
      select: { printerHost: true, printerPort: true },
    });
    return r;
  },

  /**
   * Gera (ou regenera, invalidando a anterior) a chave de acesso da ponte de impressão.
   * Devolvida em texto puro só nesta resposta — nunca mais recuperável depois, mesmo
   * padrão de "mostra a senha uma vez só".
   */
  async generateAgentKey(tenantId: string, actor: { userId: string; ip?: string }) {
    const secret = randomBytes(32).toString('hex');
    const hash = await hashPassword(secret);
    await prisma.restaurant.update({ where: { id: tenantId }, data: { printerAgentKeyHash: hash } });

    await auditService.record({
      action: AuditAction.PRINTER_AGENT_KEY_GENERATED,
      userId: actor.userId,
      restaurantId: tenantId,
      ip: actor.ip,
    });

    return { key: `${tenantId}.${secret}` };
  },

  async getStatus(tenantId: string) {
    const stuckSince = new Date(Date.now() - STUCK_JOB_MINUTES * 60_000);
    const [pendingCount, stuckCount] = await Promise.all([
      prisma.printJob.count({ where: { restaurantId: tenantId, status: PrintJobStatus.PENDING } }),
      prisma.printJob.count({
        where: { restaurantId: tenantId, status: PrintJobStatus.PENDING, createdAt: { lt: stuckSince } },
      }),
    ]);
    return { pendingCount, stuckCount };
  },
};
