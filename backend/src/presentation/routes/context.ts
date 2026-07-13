import { Request } from 'express';

export interface Ctx {
  userId: string;
  ip?: string;
  tenantId: string;
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
  };
}
