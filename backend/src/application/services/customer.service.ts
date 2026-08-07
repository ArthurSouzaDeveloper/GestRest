import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { auditService } from './audit.service';

const publicSelect = { id: true, name: true, createdAt: true };

export const customerService = {
  list(tenantId: string) {
    return prisma.customer.findMany({
      where: { restaurantId: tenantId },
      select: { ...publicSelect, phone: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Direito do titular à eliminação de dados pessoais (LGPD, Art. 18, VI): apaga
   * nome/telefone identificáveis do cadastro do cliente. NÃO apaga o endereço de entrega
   * já salvo em cada Order (snapshot tirado no momento daquele pedido) nem os próprios
   * pedidos — isso fica de propósito, porque é histórico financeiro/fiscal do restaurante
   * e o prazo de guarda exigido por lei é uma decisão que depende de contador/advogado,
   * não algo que o código deveria decidir sozinho. Ação irreversível — não há "desfazer".
   */
  async anonymize(tenantId: string, id: string, actor: { userId: string; ip?: string }) {
    const customer = await prisma.customer.findFirst({ where: { id, restaurantId: tenantId } });
    if (!customer) throw new NotFoundError('Cliente');

    const anonymized = await prisma.customer.update({
      where: { id },
      data: { name: 'Cliente removido (LGPD)', phone: null, phoneNormalized: null },
      select: publicSelect,
    });

    await auditService.record({
      action: AuditAction.CUSTOMER_ANONYMIZED,
      userId: actor.userId,
      restaurantId: tenantId,
      entity: 'Customer',
      entityId: id,
      ip: actor.ip,
    });

    return anonymized;
  },
};
