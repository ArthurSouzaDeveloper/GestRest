import dotenv from 'dotenv';

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
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
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  logLevel: process.env.LOG_LEVEL ?? ((process.env.NODE_ENV ?? 'development') === 'production' ? 'info' : 'debug'),
  // Only mark the refresh cookie `Secure` when explicitly enabled. Behind plain
  // HTTP (e.g. IP-only deploys) a Secure cookie is never sent, breaking sessions.
  // Defaults to the value of NODE_ENV=production unless COOKIE_SECURE overrides it.
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : (process.env.NODE_ENV ?? 'development') === 'production',
};
