import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAxiosInstance } = vi.hoisted(() => ({
  mockAxiosInstance: {
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => mockAxiosInstance) },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    chmod: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
  },
}));

vi.mock('jwt-decode', () => ({ jwtDecode: vi.fn() }));
vi.mock('otplib', () => ({ generateSync: vi.fn() }));

import { existsSync, promises as fsPromises } from 'fs';
import { jwtDecode } from 'jwt-decode';
import { generateSync } from 'otplib';
import { SmartRentAuthClient } from '../../../src/lib/auth.js';

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  success: vi.fn(),
};

function freshSessionDefaults() {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
  vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);
}

describe('SmartRentAuthClient', () => {
  let authClient: SmartRentAuthClient;

  beforeEach(() => {
    vi.clearAllMocks();
    authClient = new SmartRentAuthClient('/fake/storage', log as never);
  });

  it('reuses a stored session that has not expired', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        accessToken: 'stored-token',
        expires: new Date(Date.now() + 60_000).toISOString(),
      })
    );
    vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);

    const token = await authClient.getAccessToken({
      email: 'user@example.com',
      password: 'pw',
    });

    expect(token).toBe('stored-token');
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('starts a fresh session when the stored one has expired', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        accessToken: 'old-token',
        expires: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: { access_token: 'new-jwt' },
    });
    vi.mocked(jwtDecode).mockReturnValue({
      exp: 1_700_000_060,
      sub: 'User:7',
    } as never);

    const token = await authClient.getAccessToken({
      email: 'user@example.com',
      password: 'pw',
    });

    expect(token).toBe('new-jwt');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/authentication/sessions',
      { email: 'user@example.com', password: 'pw' },
      expect.anything()
    );
  });

  it('derives userId from the JWT sub claim and expires 60s before exp', async () => {
    freshSessionDefaults();
    mockAxiosInstance.post.mockResolvedValue({
      data: { access_token: 'jwt' },
    });
    vi.mocked(jwtDecode).mockReturnValue({
      exp: 1_700_000_060,
      sub: 'User:123',
    } as never);

    await authClient.getAccessToken({ email: 'a@b.com', password: 'pw' });

    const [, written] = vi.mocked(fsPromises.writeFile).mock.calls[0];
    const saved = JSON.parse(written as string);
    expect(saved.userId).toBe(123);
    expect(saved.expires).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('completes 2FA when the initial response carries a tfa_api_token', async () => {
    freshSessionDefaults();
    mockAxiosInstance.post
      .mockResolvedValueOnce({ data: { tfa_api_token: 'tfa-abc' } })
      .mockResolvedValueOnce({ data: { access_token: 'jwt-after-tfa' } });
    vi.mocked(generateSync).mockReturnValue('654321');
    vi.mocked(jwtDecode).mockReturnValue({
      exp: 1_700_000_060,
      sub: 'User:9',
    } as never);

    const token = await authClient.getAccessToken({
      email: 'a@b.com',
      password: 'pw',
      tfaSecret: 'SECRET',
    });

    expect(token).toBe('jwt-after-tfa');
    expect(generateSync).toHaveBeenCalledWith({ secret: 'SECRET' });
    expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(
      2,
      '/authentication/sessions/tfa',
      { tfa_api_token: 'tfa-abc', token: '654321' },
      expect.anything()
    );
  });

  it('errors when 2FA is required but no tfaSecret is configured', async () => {
    freshSessionDefaults();
    mockAxiosInstance.post.mockResolvedValueOnce({
      data: { tfa_api_token: 'tfa-abc' },
    });

    const token = await authClient.getAccessToken({
      email: 'a@b.com',
      password: 'pw',
    });

    expect(token).toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(
      'Account has 2FA enabled but no 2FA secret is configured'
    );
    expect(generateSync).not.toHaveBeenCalled();
  });

  it('discards a malformed session file and re-authenticates', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readFile).mockResolvedValue('{not valid json');
    vi.mocked(fsPromises.rm).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: { access_token: 'fresh-jwt' },
    });
    vi.mocked(jwtDecode).mockReturnValue({
      exp: 1_700_000_060,
      sub: 'User:1',
    } as never);

    const token = await authClient.getAccessToken({
      email: 'a@b.com',
      password: 'pw',
    });

    expect(fsPromises.rm).toHaveBeenCalled();
    expect(token).toBe('fresh-jwt');
  });

  it('persists the session file with owner-only permissions', async () => {
    freshSessionDefaults();
    mockAxiosInstance.post.mockResolvedValue({
      data: { access_token: 'jwt' },
    });
    vi.mocked(jwtDecode).mockReturnValue({
      exp: 1_700_000_060,
      sub: 'User:1',
    } as never);

    await authClient.getAccessToken({ email: 'a@b.com', password: 'pw' });

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      expect.any(String),
      { mode: 0o600 }
    );
    expect(fsPromises.chmod).toHaveBeenCalledWith(
      expect.stringContaining('session.json'),
      0o600
    );
  });

  it('logs and returns undefined when email and password are both missing', async () => {
    freshSessionDefaults();

    const token = await authClient.getAccessToken({
      email: '',
      password: '',
    });

    expect(token).toBeUndefined();
    expect(log.error).toHaveBeenCalledWith('No email or password configured');
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('logs when only email is missing', async () => {
    freshSessionDefaults();

    await authClient.getAccessToken({ email: '', password: 'pw' });

    expect(log.error).toHaveBeenCalledWith('No email configured');
  });

  it('logs when only password is missing', async () => {
    freshSessionDefaults();

    await authClient.getAccessToken({ email: 'a@b.com', password: '' });

    expect(log.error).toHaveBeenCalledWith('No password configured');
  });
});
