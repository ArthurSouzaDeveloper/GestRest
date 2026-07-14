/** Key names that must never reach a log line, matched case-insensitively with separators stripped. */
const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'senha',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'jwt',
  'cookie',
  'cpf',
  'cnpj',
  'cardnumber',
  'cvv',
];

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEYS.some((s) => normalized.includes(s));
}

/** Deep-clones a value for logging, replacing any sensitive key's value with a redacted marker. */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, seen);
  }
  return out;
}

/** Masks an e-mail for security logs (e.g. failed login attempts) while keeping enough signal to spot patterns. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return REDACTED;
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(1, user.length - visible.length))}@${domain}`;
}
