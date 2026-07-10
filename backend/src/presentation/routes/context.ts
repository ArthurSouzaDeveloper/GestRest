import { Request } from 'express';

/** Extracts the audit context (user id + client IP) from an authenticated request. */
export function ctx(req: Request): { userId: string; ip?: string } {
  return { userId: req.user!.sub, ip: req.ip };
}
