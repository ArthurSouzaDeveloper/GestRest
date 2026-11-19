import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { userService } from './user.service';

/**
 * Excluir um usuário é arquivar: o cadastro continua no banco (histórico de pedidos e
 * pagamentos intacto), sai da lista da equipe, perde o acesso, e pode ser reativado.
 */
describe('usuário excluído fica arquivado e pode voltar', () => {
  let restaurantId: string;
  let adminId: string;
  let waiterId: string;
  let waiterEmail: string;

  const requester = () => ({ userId: adminId, role: Role.ADMIN });

  beforeAll(async () => {
    restaurantId = (
      await prisma.restaurant.create({ data: { name: 'Teste Arquivo', slug: `teste-arquivo-${randomUUID()}` } })
    ).id;
    adminId = (
      await prisma.user.create({
        data: {
          name: 'Dona do Restaurante',
          email: `admin-${randomUUID()}@teste.com`,
          passwordHash: 'x',
          role: Role.ADMIN,
          restaurantId,
        },
      })
    ).id;
    waiterEmail = `garcom-${randomUUID()}@teste.com`;
    waiterId = (
      await prisma.user.create({
        data: { name: 'Garçom', email: waiterEmail, passwordHash: 'x', role: Role.WAITER, restaurantId },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('arquiva em vez de apagar, mesmo sem nenhum pedido', async () => {
    await userService.remove(restaurantId, waiterId, requester());

    const row = await prisma.user.findUnique({ where: { id: waiterId } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.active).toBe(false);

    const team = await userService.list(restaurantId);
    expect(team.map((u) => u.id)).not.toContain(waiterId);

    const archived = await userService.listDeleted(restaurantId);
    expect(archived.map((u) => u.id)).toContain(waiterId);
  });

  it('avisa que o e-mail está preso a um usuário excluído', async () => {
    await expect(
      userService.create(
        restaurantId,
        { name: 'Outro Garçom', email: waiterEmail, password: 'Senha@12345', role: Role.WAITER },
        requester(),
      ),
    ).rejects.toThrow(/exclu/i);
  });

  it('reativa o usuário arquivado de volta na equipe', async () => {
    const restored = await userService.restore(restaurantId, waiterId, requester());
    expect(restored.active).toBe(true);

    const team = await userService.list(restaurantId);
    expect(team.map((u) => u.id)).toContain(waiterId);
    expect(await userService.listDeleted(restaurantId)).toHaveLength(0);
  });

  it('não deixa arquivar o último administrador ativo', async () => {
    await expect(userService.remove(restaurantId, adminId, { userId: waiterId, role: Role.ADMIN })).rejects.toThrow(
      /último administrador/i,
    );
  });
});
