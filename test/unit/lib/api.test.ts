import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/client.js', () => ({
  SmartRentApiClient: vi.fn().mockImplementation(function () {
    return { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
  }),
  SmartRentWebsocketClient: vi.fn().mockImplementation(function () {
    return { subscribeDevice: vi.fn(), event: {} };
  }),
}));

import { SmartRentApi } from '../../../src/lib/api.js';
import { createMockPlatform } from '../helpers/hap.js';

function unitRecords(units: Record<string, unknown>[]) {
  return {
    current_page: 1,
    records: units,
    total_pages: 1,
    total_records: units.length,
  };
}

function unit(overrides: Record<string, unknown> = {}) {
  return {
    marketing_name: 'Unit A',
    hub_id: 42,
    ...overrides,
  };
}

function buildApi(configOverrides: Record<string, unknown> = {}) {
  const platform = createMockPlatform(configOverrides);
  const api = new SmartRentApi(platform);
  const client = api.client as unknown as {
    get: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  const websocket = api.websocket as unknown as {
    subscribeDevice: ReturnType<typeof vi.fn>;
  };
  return { api, platform, client, websocket };
}

describe('SmartRentApi.discoverDevices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks the unit matching config.unitName', async () => {
    const { api, client, websocket } = buildApi({ unitName: 'Unit B' });
    client.get.mockImplementation((path: string) => {
      if (path === '/units') {
        return Promise.resolve(
          unitRecords([
            unit({ marketing_name: 'Unit A', hub_id: 1 }),
            unit({ marketing_name: 'Unit B', hub_id: 2 }),
          ])
        );
      }
      expect(path).toBe('/hubs/2/devices');
      return Promise.resolve([{ id: 99, type: 'switch_binary' }]);
    });

    const devices = await api.discoverDevices();

    expect(devices).toEqual([{ id: 99, type: 'switch_binary' }]);
    expect(websocket.subscribeDevice).toHaveBeenCalledWith(99);
  });

  it('picks the first unit when no unitName is configured', async () => {
    const { api, client } = buildApi();
    client.get.mockImplementation((path: string) => {
      if (path === '/units') {
        return Promise.resolve(
          unitRecords([unit({ marketing_name: 'Unit A', hub_id: 1 })])
        );
      }
      return Promise.resolve([]);
    });

    await api.discoverDevices();

    expect(client.get).toHaveBeenCalledWith('/hubs/1/devices');
  });

  it('logs and returns undefined when the configured unit is not found', async () => {
    const { api, client, platform } = buildApi({ unitName: 'Missing Unit' });
    client.get.mockResolvedValue(unitRecords([unit()]));

    const devices = await api.discoverDevices();

    expect(devices).toBeUndefined();
    expect(platform.log.error).toHaveBeenCalledWith(
      'Unit Missing Unit not found'
    );
  });

  it('logs and returns undefined when the unit has no hub', async () => {
    const { api, client, platform } = buildApi();
    client.get.mockResolvedValue(unitRecords([unit({ hub_id: 0 })]));

    const devices = await api.discoverDevices();

    expect(devices).toBeUndefined();
    expect(platform.log.error).toHaveBeenCalledWith('No SmartRent hub found');
  });
});

describe('SmartRentApi.setState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stringifies boolean and number attribute states before patching', async () => {
    const { api, client } = buildApi();
    client.patch.mockResolvedValue({ attributes: [] });

    await api.setState('1', '2', [
      { name: 'on', state: true },
      { name: 'level', state: 42 },
      { name: 'mode', state: 'cool' },
    ]);

    expect(client.patch).toHaveBeenCalledWith('/hubs/1/devices/2', {
      attributes: [
        { name: 'on', state: 'true' },
        { name: 'level', state: '42' },
        { name: 'mode', state: 'cool' },
      ],
    });
  });

  it('returns the attributes from the patch response', async () => {
    const { api, client } = buildApi();
    const attributes = [{ name: 'on', state: 'true' }];
    client.patch.mockResolvedValue({ attributes });

    await expect(
      api.setState('1', '2', [{ name: 'on', state: true }])
    ).resolves.toBe(attributes);
  });
});
