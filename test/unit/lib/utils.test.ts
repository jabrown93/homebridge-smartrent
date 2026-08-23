import { describe, expect, it } from 'vitest';
import {
  decodeJwtPayload,
  findStateByName,
  redactSensitive,
} from '../../../src/lib/utils.js';

describe('findStateByName', () => {
  it('returns the state of the matching attribute', () => {
    const attrs = [
      { name: 'on', state: true },
      { name: 'level', state: 42 },
    ];
    expect(findStateByName(attrs, 'level')).toBe(42);
  });

  it('returns null when no attribute matches', () => {
    const attrs = [{ name: 'on', state: true }];
    expect(findStateByName(attrs, 'missing')).toBeNull();
  });

  it('returns null for an empty attribute list', () => {
    expect(findStateByName([], 'on')).toBeNull();
  });
});

describe('redactSensitive', () => {
  it('redacts known-sensitive keys at the top level', () => {
    const result = redactSensitive({
      password: 'hunter2',
      email: 'user@example.com',
    });
    expect(result).toEqual({
      password: '[REDACTED]',
      email: 'user@example.com',
    });
  });

  it('matches sensitive keys case-insensitively', () => {
    const result = redactSensitive({ Authorization: 'Bearer abc' });
    expect(result).toEqual({ Authorization: '[REDACTED]' });
  });

  it('redacts sensitive keys nested in objects', () => {
    const result = redactSensitive({
      data: { access_token: 'abc123', userId: 5 },
    });
    expect(result).toEqual({
      data: { access_token: '[REDACTED]', userId: 5 },
    });
  });

  it('redacts sensitive keys inside arrays', () => {
    const result = redactSensitive([{ token: 'abc' }, { token: 'def' }]);
    expect(result).toEqual([{ token: '[REDACTED]' }, { token: '[REDACTED]' }]);
  });

  it('passes through primitives unchanged', () => {
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });
});

describe('decodeJwtPayload', () => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = (claims: unknown) =>
    [encode({ alg: 'HS256', typ: 'JWT' }), encode(claims), 'signature'].join(
      '.'
    );

  it('extracts the claims SmartRent sessions depend on', () => {
    const payload = decodeJwtPayload(
      jwt({ exp: 1_700_000_060, sub: 'User:7' })
    );
    expect(payload.exp).toBe(1_700_000_060);
    expect(payload.sub).toBe('User:7');
  });

  it('decodes base64url payloads containing - and _', () => {
    const payload = decodeJwtPayload(jwt({ sub: 'User:7', note: 'a~b?c>>d' }));
    expect(payload.note).toBe('a~b?c>>d');
  });

  it('rejects a token that is not three segments', () => {
    expect(() => decodeJwtPayload('header.payload')).toThrow(/three/);
  });

  it('rejects a token with an empty payload segment', () => {
    expect(() => decodeJwtPayload('header..signature')).toThrow(/three/);
  });

  it('rejects a payload that is not valid JSON', () => {
    const bad = [
      'header',
      Buffer.from('not json').toString('base64url'),
      'sig',
    ];
    expect(() => decodeJwtPayload(bad.join('.'))).toThrow(/not valid JSON/);
  });

  it('rejects a payload that is JSON but not an object', () => {
    expect(() => decodeJwtPayload(jwt('a string'))).toThrow(
      /not a JSON object/
    );
    expect(() => decodeJwtPayload(jwt([1, 2]))).toThrow(/not a JSON object/);
  });
});
