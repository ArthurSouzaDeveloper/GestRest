import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { env } from './config/env';
import api from './presentation/routes';
import { errorHandler, notFoundHandler } from './presentation/middlewares/error.middleware';
import { apiLimiter } from './presentation/middlewares/rateLimit.middleware';
import { requestContextMiddleware } from './presentation/middlewares/requestContext.middleware';
import { openApiDocument } from './config/swagger';

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);
  // First middleware: opens the requestId/ip context so every log line from here on is correlated.
  app.use(requestContextMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Static uploads
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)));

  // API docs — dev/staging only. In production this would hand anyone who finds the
  // URL a full unauthenticated map of every endpoint and payload shape.
  if (!env.isProd) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  // Rate-limited API
  app.use('/api', apiLimiter, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
