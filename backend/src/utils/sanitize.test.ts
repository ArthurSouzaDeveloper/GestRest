import { describe, expect, it } from 'vitest';
import { maskEmail, redact } from './sanitize';

describe('redact', () => {
  it('redacts known sensitive keys at any depth', () => {
    const out = redact({
      email: 'user@example.com',
      password: 'super-secret',
      user: { passwordHash: 'abc123', name: 'Ana' },
      headers: { Authorization: 'Bearer xyz' },
    }) as Record<string, unknown>;

    expect(out.password).toBe('[REDACTED]');
    expect((out.user as Record<string, unknown>).passwordHash).toBe('[REDACTED]');
    expect((out.headers as Record<string, unknown>).Authorization).toBe('[REDACTED]');
    expect(out.email).toBe('user@example.com');
    expect((out.user as Record<string, unknown>).name).toBe('Ana');
  });

  it('redacts tokens inside arrays', () => {
    const out = redact({ lines: [{ accessToken: 'a' }, { refreshToken: 'b' }] }) as Record<string, unknown>;
    const lines = out.lines as Record<string, unknown>[];
    expect(lines[0].accessToken).toBe('[REDACTED]');
    expect(lines[1].refreshToken).toBe('[REDACTED]');
  });

  it('turns Error instances into plain name/message/stack objects', () => {
    const err = new Error('boom');
    const out = redact({ error: err }) as Record<string, unknown>;
    const serialized = out.error as Record<string, unknown>;
    expect(serialized.message).toBe('boom');
    expect(serialized.name).toBe('Error');
    expect(typeof serialized.stack).toBe('string');
  });

  it('does not choke on circular references', () => {
    const obj: Record<string, unknown> = { name: 'x' };
    obj.self = obj;
    const out = redact(obj) as Record<string, unknown>;
    expect(out.self).toBe('[CIRCULAR]');
  });

  it('leaves primitives untouched', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
  });
});

describe('maskEmail', () => {
  it('keeps the first two chars and the domain, masks the rest', () => {
    expect(maskEmail('arthur@gestrest.com')).toBe('ar****@gestrest.com');
  });

  it('handles very short local parts', () => {
    expect(maskEmail('a@x.com')).toBe('a*@x.com');
  });

  it('redacts malformed input with no @', () => {
    expect(maskEmail('not-an-email')).toBe('[REDACTED]');
  });
});
