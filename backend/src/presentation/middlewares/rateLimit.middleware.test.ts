import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { signAccessToken } from '../../utils/auth';
import { staffOrIpKey } from './rateLimit.middleware';

function req(ip: string, authorization?: string): Request {
  return { ip, headers: authorization ? { authorization } : {} } as unknown as Request;
}

describe('staffOrIpKey — chave do limite geral da API', () => {
  it('funcionários logados atrás do mesmo IP do restaurante contam cada um no seu limite', () => {
    const a = signAccessToken({ sub: 'user-a', role: Role.COOK, name: 'A', restaurantId: 'r1' });
    const b = signAccessToken({ sub: 'user-b', role: Role.MOTOBOY, name: 'B', restaurantId: 'r1' });
    expect(staffOrIpKey(req('200.1.1.1', `Bearer ${a}`))).toBe('user:user-a');
    expect(staffOrIpKey(req('200.1.1.1', `Bearer ${b}`))).toBe('user:user-b');
  });

  it('sem token, ou com token inválido, conta pelo IP', () => {
    expect(staffOrIpKey(req('200.1.1.1'))).toBe('200.1.1.1');
    expect(staffOrIpKey(req('200.1.1.1', 'Bearer forjado.invalido.x'))).toBe('200.1.1.1');
  });
});
