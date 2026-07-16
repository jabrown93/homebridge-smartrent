import { DeviceAttribute } from '../devices/index.js';

export function findStateByName(
  objects: DeviceAttribute[],
  name: string
): string | number | boolean | null {
  return objects.find(obj => obj.name === name)?.state ?? null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'tfa_api_token',
  'access_token',
  'accesstoken',
  'websockettoken',
  'authorization',
]);

/**
 * Recursively redacts values of known-sensitive keys (passwords, tokens, auth headers)
 * so request/response payloads can be safely logged at debug level.
 */
export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(redactSensitive) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : redactSensitive(val);
    }
    return result as T;
  }
  return value;
}
