import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  name: string;
  restaurantId: string | null;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Pinned explicitly on both sign and verify so a token can never be forged by switching to
// a different algorithm (e.g. "none", or an asymmetric alg the server would otherwise accept
// using the secret as a public key) — classic JWT "alg confusion" attack surface.
const JWT_ALGORITHM = 'HS256';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  // `jti` (a random token id) guarantees every refresh token is unique, even
  // when two are minted within the same second — otherwise identical `iat`
  // claims would produce identical tokens and collide on the unique index.
  return jwt.sign({ sub: userId, jti: randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret, { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwt.refreshSecret, { algorithms: [JWT_ALGORITHM] }) as { sub: string };
}
