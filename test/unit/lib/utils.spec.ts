import { describe, expect, it } from 'vitest';
import { findStateByName, redactSensitive } from '../../../src/lib/utils.js';

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
