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

/**
 * Decodes the payload of a JWT without verifying its signature.
 *
 * SmartRent's tokens are consumed only to read `exp` and `sub`, and they arrive
 * over TLS from the endpoint that just issued them, so there is no signature to
 * check against a key we hold. Callers must not treat the result as trusted.
 *
 * @param token compact-serialization JWT (`header.payload.signature`)
 * @throws if the token is not three segments or its payload is not a JSON object
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  if (typeof token !== 'string') {
    throw new Error('Invalid JWT: expected a string');
  }
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1]) {
    throw new Error('Invalid JWT: expected three non-empty segments');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8')
    );
  } catch (error) {
    throw new Error('Invalid JWT: payload is not valid JSON', {
      cause: error,
    });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error('Invalid JWT: payload is not a JSON object');
  }
  return payload as Record<string, unknown>;
}
