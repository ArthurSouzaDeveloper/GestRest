import { Request } from 'express';
import { Role } from '@prisma/client';

export interface Ctx {
  userId: string;
  ip?: string;
  tenantId: string;
  role: Role;
}

/**
 * Extracts the tenant-scoped audit context from an authenticated request.
 * For tenant routes the caller is guaranteed (by RBAC) to have a restaurantId;
 * we assert it here so services can rely on a non-null tenant id.
 */
export function ctx(req: Request): Ctx {
  return {
    userId: req.user!.sub,
    ip: req.ip,
    tenantId: req.user!.restaurantId as string,
    role: req.user!.role,
  };
}
