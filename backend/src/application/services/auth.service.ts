import { AuditAction } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  comparePassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/auth';
import { UnauthorizedError } from '../../utils/errors';
import { env } from '../../config/env';
import { auditService } from './audit.service';

function refreshExpiryDate(): Date {
  // 7 days default; keep in sync with JWT_REFRESH_EXPIRES
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export const authService = {
  async login(email: string, password: string, ip?: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) throw new UnauthorizedError('Credenciais inválidas');

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Credenciais inválidas');

    const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
    const refreshToken = signRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: refreshExpiryDate() },
    });

    await auditService.record({ action: AuditAction.LOGIN, userId: user.id, ip });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  async refresh(token: string) {
    if (!token) throw new UnauthorizedError('Refresh token ausente');

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError('Refresh token inválido');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Sessão expirada');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedError('Usuário inválido');

    // Rotate refresh token
    await prisma.refreshToken.update({ where: { token }, data: { revoked: true } });
    const newRefresh = signRefreshToken(user.id);
    await prisma.refreshToken.create({
      data: { token: newRefresh, userId: user.id, expiresAt: refreshExpiryDate() },
    });

    const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
    return { accessToken, refreshToken: newRefresh };
  },

  async logout(token: string) {
    if (!token) return;
    await prisma.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user) throw new UnauthorizedError();
    return user;
  },
};

export const cookieRefreshOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};
