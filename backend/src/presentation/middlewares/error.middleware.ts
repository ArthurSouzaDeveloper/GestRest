import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    logger.warn('validation_error', { path: req.originalUrl, details: err.flatten() });
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: err.flatten() },
    });
    return;
  }

  if (err instanceof AppError) {
    // Client errors (4xx) are expected traffic, but still worth a warn-level trail —
    // a spike of 409s/403s on one route/user is a signal, not noise.
    logger.warn('app_error', { path: req.originalUrl, code: err.code, message: err.message });
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      logger.warn('prisma_conflict', { path: req.originalUrl, code: err.code, meta: err.meta });
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Registro duplicado' } });
      return;
    }
    if (err.code === 'P2025') {
      logger.warn('prisma_not_found', { path: req.originalUrl, code: err.code });
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Registro não encontrado' } });
      return;
    }
  }

  logger.error('unhandled_error', { path: req.originalUrl, error: err });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } });
}
