import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

// Same rule as prisma/seed.ts's SEED_PASSWORD guard: a dev-friendly fallback is fine locally,
// but in production a missing secret must crash startup instead of silently signing tokens
// (or reaching for a database) with a well-known default value that sits in plain text in
// this very repo — anyone who has ever cloned it knows "dev-access-secret".
function required(key: string, devFallback?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (!isProd && devFallback !== undefined) return devFallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export const env = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL', 'postgresql://gestrest:gestrest@localhost:5432/gestrest'),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  logLevel: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  // Only mark the refresh cookie `Secure` when explicitly enabled. Behind plain
  // HTTP (e.g. IP-only deploys) a Secure cookie is never sent, breaking sessions.
  // Defaults to the value of NODE_ENV=production unless COOKIE_SECURE overrides it.
  cookieSecure: process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : isProd,
};
