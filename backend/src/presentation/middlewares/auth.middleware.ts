import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken, AccessTokenPayload } from '../../utils/auth';
import { ForbiddenError, UnauthorizedError } from '../../utils/errors';
import { logger } from '../../config/logger';
import { setContextActor } from '../../config/requestContext';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Token ausente');
  try {
    req.user = verifyAccessToken(header.slice(7));
    setContextActor(req.user.sub, req.user.restaurantId ?? undefined);
    next();
  } catch (err) {
    logger.warn('auth_token_rejected', { reason: err instanceof Error ? err.message : String(err) });
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

/** Restricts a route to the given roles. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError();
    if (roles.length && !roles.includes(req.user.role)) {
      throw new ForbiddenError('Você não tem permissão para esta ação');
    }
    next();
  };
}
