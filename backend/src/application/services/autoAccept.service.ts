import { prisma } from '../../config/prisma';

/**
 * Aceite automático de pedidos online (delivery/retirada) — quando ligado, um pedido
 * criado pelo site público já nasce OPEN em vez de esperar aceite manual (PENDING).
 * Config direto em Restaurant, sem tabela própria, mesmo padrão de etaSettingsService.
 * Escrita restrita a Role.ADMIN em catalog.routes.ts — mesma decisão operacional já
 * tomada pro tempo estimado.
 */
export const autoAcceptService = {
  async get(tenantId: string) {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { autoAcceptOnlineOrders: true },
    });
    return { enabled: r.autoAcceptOnlineOrders };
  },

  async update(tenantId: string, data: { enabled: boolean }) {
    const r = await prisma.restaurant.update({
      where: { id: tenantId },
      data: { autoAcceptOnlineOrders: data.enabled },
      select: { autoAcceptOnlineOrders: true },
    });
    return { enabled: r.autoAcceptOnlineOrders };
  },
};
