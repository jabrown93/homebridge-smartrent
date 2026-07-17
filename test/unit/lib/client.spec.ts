import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockWebSocket, createdSockets } = vi.hoisted(() => {
  const createdSockets: InstanceType<typeof MockWebSocketClass>[] = [];

  class MockWebSocketClass {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocketClass.OPEN;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    send = vi.fn();
    close = vi.fn();
    url: string;

    constructor(url: string) {
      this.url = url;
      createdSockets.push(this);
    }
  }

  return { MockWebSocket: MockWebSocketClass, createdSockets };
});

vi.mock('ws', () => ({ default: MockWebSocket }));
vi.mock('node:crypto', () => ({ randomInt: vi.fn(() => 0) }));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

vi.mock('../../../src/lib/auth.js', () => ({
  SmartRentAuthClient: vi.fn().mockImplementation(function () {
    return {
      getAccessToken: vi.fn().mockResolvedValue('fake-access-token'),
      getWebSocketToken: vi.fn().mockResolvedValue('fake-ws-token'),
    };
  }),
}));

import { SmartRentWebsocketClient } from '../../../src/lib/client.js';
import { createMockPlatform } from '../helpers/hap.js';

async function buildWebsocketClient() {
  const platform = createMockPlatform();
  const client = new SmartRentWebsocketClient(platform);
  await client.wsClient;
  return { client, platform };
}

describe('SmartRentWebsocketClient', () => {
  beforeEach(() => {
    createdSockets.length = 0;
    vi.clearAllMocks();
  });

  describe('message dispatch', () => {
    it('dispatches attribute_state frames to the subscribed device handler', async () => {
      const { client } = await buildWebsocketClient();
      const socket = createdSockets[0];
      await client.subscribeDevice(10);
      const handler = vi.fn();
      client.event['10'] = handler;

      socket.onmessage!({
        data: JSON.stringify([
          null,
          null,
          'devices:10',
          'attribute_state',
          { name: 'on', last_read_state: 'true' },
        ]),
      });

      expect(handler).toHaveBeenCalledWith({
        name: 'on',
        last_read_state: 'true',
      });
    });

    it('ignores frames for devices with no subscribed handler', async () => {
      const { client } = await buildWebsocketClient();
      const socket = createdSockets[0];
      void client;

      expect(() =>
        socket.onmessage!({
          data: JSON.stringify([
            null,
            null,
            'devices:999',
            'attribute_state',
            { name: 'on', last_read_state: 'true' },
          ]),
        })
      ).not.toThrow();
    });

    it('ignores malformed frames without throwing', async () => {
      const { client } = await buildWebsocketClient();
      const socket = createdSockets[0];
      void client;

      expect(() => socket.onmessage!({ data: 'not valid json' })).not.toThrow();
    });
  });

  describe('subscribeDevice', () => {
    it('sends a phx_join frame when the socket is open', async () => {
      const { client } = await buildWebsocketClient();
      const socket = createdSockets[0];
      socket.readyState = MockWebSocket.OPEN;

      await client.subscribeDevice(55);

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify([null, null, 'devices:55', 'phx_join', {}])
      );
    });

    it('retries once the socket becomes open', async () => {
      vi.useFakeTimers();
      const { client, platform } = await buildWebsocketClient();
      const socket = createdSockets[0];
      socket.readyState = MockWebSocket.CONNECTING;

      await client.subscribeDevice(77);
      expect(socket.send).not.toHaveBeenCalled();
      expect(platform.log.error).toHaveBeenCalled();

      socket.readyState = MockWebSocket.OPEN;
      await vi.advanceTimersByTimeAsync(1000);

      expect(socket.send).toHaveBeenCalledWith(
        JSON.stringify([null, null, 'devices:77', 'phx_join', {}])
      );
      vi.useRealTimers();
    });
  });

  describe('reconnect backoff', () => {
    it('reconnects after a delay that doubles on each consecutive failure', async () => {
      vi.useFakeTimers();
      await buildWebsocketClient();
      const first = createdSockets[0];

      first.onclose!({ code: 1006, reason: 'boom' });
      await vi.advanceTimersByTimeAsync(999);
      expect(createdSockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(createdSockets).toHaveLength(2);

      const second = createdSockets[1];
      second.onclose!({ code: 1006, reason: 'boom again' });
      await vi.advanceTimersByTimeAsync(1999);
      expect(createdSockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(createdSockets).toHaveLength(3);

      vi.useRealTimers();
    });

    it('resets the backoff once a reconnected socket stays open past the stable window', async () => {
      vi.useFakeTimers();
      await buildWebsocketClient();
      const first = createdSockets[0];

      first.onclose!({ code: 1006, reason: 'x' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(createdSockets).toHaveLength(2);

      const second = createdSockets[1];
      second.onopen!();
      await vi.advanceTimersByTimeAsync(30000);

      second.onclose!({ code: 1006, reason: 'y' });
      await vi.advanceTimersByTimeAsync(999);
      expect(createdSockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(createdSockets).toHaveLength(3);

      vi.useRealTimers();
    });
  });
});
