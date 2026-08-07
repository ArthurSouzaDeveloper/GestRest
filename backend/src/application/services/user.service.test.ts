import { randomUUID } from 'crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ForbiddenError } from '../../utils/errors';
import { userService } from './user.service';

/**
 * Teste de integração (banco real) pro achado de auditoria de maior severidade depois
 * dos segredos/porta expostos: PATCH /users/:id não tinha NENHUMA checagem de hierarquia,
 * permitindo um MANAGER se autopromover a ADMIN ou resetar a senha de um ADMIN existente
 * (sequestro de conta). Cobre as três barreiras novas em userService.update().
 */
describe('userService.update — barreiras de hierarquia (achado de auditoria)', () => {
  let restaurantId: string;
  let adminId: string;
  let managerId: string;

  async function freshUsers() {
    const restaurant = await prisma.restaurant.create({
      data: { name: 'Teste Hierarquia', slug: `teste-hierarquia-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    const admin = await prisma.user.create({
      data: { name: 'Admin', email: `admin-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.ADMIN, restaurantId },
    });
    const manager = await prisma.user.create({
      data: { name: 'Manager', email: `manager-${randomUUID()}@teste.local`, passwordHash: 'x', role: Role.MANAGER, restaurantId },
    });
    adminId = admin.id;
    managerId = manager.id;
  }

  beforeEach(freshUsers);
  afterAll(async () => {
    if (restaurantId) await prisma.restaurant.delete({ where: { id: restaurantId } });
  });

  it('um MANAGER não pode se autopromover a ADMIN', async () => {
    await expect(
      userService.update(restaurantId, managerId, { role: Role.ADMIN }, { userId: managerId, role: Role.MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stillManager = await prisma.user.findUniqueOrThrow({ where: { id: managerId } });
    expect(stillManager.role).toBe(Role.MANAGER);
  });

  it('um MANAGER não pode resetar a senha de um ADMIN existente', async () => {
    await expect(
      userService.update(restaurantId, adminId, { password: 'NovaSenha123' }, { userId: managerId, role: Role.MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('um MANAGER não pode desativar um ADMIN existente', async () => {
    await expect(
      userService.update(restaurantId, adminId, { active: false }, { userId: managerId, role: Role.MANAGER }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('um ADMIN consegue promover outro usuário a ADMIN normalmente (não é bloqueio geral)', async () => {
    const updated = await userService.update(
      restaurantId,
      managerId,
      { role: Role.ADMIN },
      { userId: adminId, role: Role.ADMIN },
    );
    expect(updated.role).toBe(Role.ADMIN);
  });

  it('não deixa o tenant sem nenhum admin ativo (desativar o último admin)', async () => {
    // Só existe 1 ADMIN (adminId) neste fixture — desativá-lo tem que falhar, mesmo sendo
    // ele próprio quem está fazendo a ação (active, diferente de role, não passa pela
    // barreira de "não altere seu próprio perfil" — é a barreira de "último admin" que
    // precisa pegar esse caso).
    await expect(
      userService.update(restaurantId, adminId, { active: false }, { userId: adminId, role: Role.ADMIN }),
    ).rejects.toThrow(/último administrador/);
  });
});
