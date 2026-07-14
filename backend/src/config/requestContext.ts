import { AsyncLocalStorage } from 'async_hooks';

/** Context propagated automatically through a request's async chain — every logger call picks this up without threading it through every function. */
export interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Called once auth succeeds, so later logs in the same request carry the actor's identity. */
export function setContextActor(userId: string, tenantId?: string): void {
  const current = storage.getStore();
  if (current) {
    current.userId = userId;
    current.tenantId = tenantId;
  }
}
