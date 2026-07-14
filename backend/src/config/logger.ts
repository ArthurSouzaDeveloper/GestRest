import winston from 'winston';
import { env } from './env';
import { getContext } from './requestContext';
import { redact } from '../utils/sanitize';

/** Injects requestId/userId/tenantId from the async-local request context into every log line. */
const contextFormat = winston.format((info) => {
  const ctx = getContext();
  if (ctx) {
    if (ctx.requestId) info.requestId = ctx.requestId;
    if (ctx.userId) info.userId = ctx.userId;
    if (ctx.tenantId) info.tenantId = ctx.tenantId;
    if (ctx.ip) info.ip = ctx.ip;
  }
  return info;
});

/**
 * Redacts sensitive keys (passwords, tokens, secrets...) from the whole log payload.
 * Mutates `info` in place rather than returning a new object — logform/winston stash
 * internal state (level color, message symbols) on non-enumerable/symbol keys of that
 * exact object reference, which a plain `redact()`-built copy would silently drop.
 */
const maskFormat = winston.format((info) => {
  const cleaned = redact(info) as Record<string, unknown>;
  for (const key of Object.keys(info)) delete (info as Record<string, unknown>)[key];
  Object.assign(info, cleaned);
  return info;
});

// `fatal` sits above `error` for crashes that terminate the process (bootstrap failure,
// uncaughtException, unhandledRejection) — winston's built-in npm levels don't have one.
const levels = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 };
winston.addColors({ fatal: 'magenta', error: 'red', warn: 'yellow', info: 'green', debug: 'blue' });

export const logger = winston.createLogger({
  levels,
  level: env.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    contextFormat(),
    maskFormat(),
    env.isProd
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
            const extraKeys = Object.keys(meta).filter((k) => k !== 'ms');
            const extra = extraKeys.length
              ? ' ' + JSON.stringify(Object.fromEntries(extraKeys.map((k) => [k, (meta as Record<string, unknown>)[k]])))
              : '';
            return `${timestamp} [${level}] ${stack ?? message}${extra}`;
          }),
        ),
  ),
  transports: [new winston.transports.Console()],
}) as winston.Logger & Record<'fatal', winston.LeveledLogMethod>;
