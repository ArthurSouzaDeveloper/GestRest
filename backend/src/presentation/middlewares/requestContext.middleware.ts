import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { runWithContext } from '../../config/requestContext';
import { logger } from '../../config/logger';

/**
 * Opens the async-local request context (requestId + ip) for the whole request lifecycle
 * and logs one line per request on completion. Must run before any other middleware so
 * downstream logs — including auth failures and the error handler — carry the requestId.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const startedAt = Date.now();

  runWithContext({ requestId, ip: req.ip }, () => {
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('http_request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  });
}
