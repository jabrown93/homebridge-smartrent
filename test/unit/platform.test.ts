import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/api.js', () => ({
  SmartRentApi: vi.fn().mockImplementation(function () {
    return {
      discoverDevices: vi.fn().mockResolvedValue([]),
      client: { getAccessToken: vi.fn() },
      getState: vi.fn(),
      setState: vi.fn(),
      getData: vi.fn(),
      websocket: { event: {} },
    };
  }),
}));

vi.mock('../../src/accessories/index.js', () => ({
  LeakSensorAccessory: vi.fn(),
  LockAccessory: vi.fn(),
  MotionSensorAccessory: vi.fn(),
  SwitchAccessory: vi.fn(),
  ThermostatAccessory: vi.fn(),
  SwitchMultilevelAccessory: vi.fn(),
}));

import { SmartRentPlatform } from '../../src/platform.js';
import {
  LeakSensorAccessory,
  LockAccessory,
  MotionSensorAccessory,
  SwitchAccessory,
  SwitchMultilevelAccessory,
  ThermostatAccessory,
} from '../../src/accessories/index.js';
import { createMockPlatform } from './helpers/hap.js';
import type { SmartRentPlatformConfig } from '../../src/lib/config.js';

type RawDevice = {
  id: number;
  name: string;
  type: string;
  attributes: { name: string; state: null }[];
};

function device(
  type: string,
  attributeNames: string[] = [],
  overrides: Partial<RawDevice> = {}
): RawDevice {
  return {
    id: 1,
    name: 'Test Device',
    type,
    attributes: attributeNames.map(name => ({ name, state: null })),
    ...overrides,
  };
}

function buildPlatform(configOverrides: Partial<SmartRentPlatformConfig> = {}) {
  const mock = createMockPlatform(configOverrides);
  const platform = new SmartRentPlatform(mock.log, mock.config, mock.api);
  const apiClient = platform.smartRentApi as unknown as {
    discoverDevices: ReturnType<typeof vi.fn>;
  };
  return { platform, log: mock.log, api: mock.api, apiClient };
}

describe('SmartRentPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and skips devices with a type outside ALLOWED_DEVICE_TYPES', async () => {
    const { platform, log, api, apiClient } = buildPlatform();
    apiClient.discoverDevices.mockResolvedValue([device('unknown_type')]);

    await platform.discoverDevices();

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown device type: unknown_type')
    );
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
  });

  it('routes sensor_notification+leak to LeakSensorAccessory when enabled', async () => {
    const { platform, api, apiClient } = buildPlatform({
      enableLeakSensors: true,
    });
    apiClient.discoverDevices.mockResolvedValue([
      device('sensor_notification', ['leak']),
    ]);

    await platform.discoverDevices();

    expect(LeakSensorAccessory).toHaveBeenCalledTimes(1);
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
  });

  it('does not register sensor_notification+leak when the flag is disabled', async () => {
    const { platform, log, api, apiClient } = buildPlatform({
      enableLeakSensors: false,
    });
    apiClient.discoverDevices.mockResolvedValue([
      device('sensor_notification', ['leak']),
    ]);

    await platform.discoverDevices();

    expect(LeakSensorAccessory).not.toHaveBeenCalled();
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      'Disabled device type: sensor_notification'
    );
  });

  it('routes sensor_notification+motion_binary to MotionSensorAccessory when enabled', async () => {
    const { platform, apiClient } = buildPlatform({
      enableMotionSensors: true,
    });
    apiClient.discoverDevices.mockResolvedValue([
      device('sensor_notification', ['motion_binary']),
    ]);

    await platform.discoverDevices();

    expect(MotionSensorAccessory).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['entry_control', 'enableLocks', LockAccessory],
    ['switch_binary', 'enableSwitches', SwitchAccessory],
    ['thermostat', 'enableThermostats', ThermostatAccessory],
    ['switch_multilevel', 'enableSwitchMultiLevels', SwitchMultilevelAccessory],
  ] as const)(
    'routes %s to its accessory class when %s is enabled',
    async (type, flag, AccessoryClass) => {
      const { platform, apiClient } = buildPlatform({ [flag]: true });
      apiClient.discoverDevices.mockResolvedValue([device(type)]);

      await platform.discoverDevices();

      expect(AccessoryClass).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['entry_control', LockAccessory],
    ['switch_binary', SwitchAccessory],
    ['thermostat', ThermostatAccessory],
    ['switch_multilevel', SwitchMultilevelAccessory],
  ] as const)(
    'does not route %s when its enable flag is unset',
    async (type, AccessoryClass) => {
      const { platform, api, apiClient } = buildPlatform();
      apiClient.discoverDevices.mockResolvedValue([device(type)]);

      await platform.discoverDevices();

      expect(AccessoryClass).not.toHaveBeenCalled();
      expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    }
  );

  it('restores a cached accessory via updatePlatformAccessories instead of registering it again', async () => {
    const { platform, api, apiClient } = buildPlatform({
      enableSwitches: true,
    });
    const uuid = 'uuid-1';
    (api.hap.uuid.generate as ReturnType<typeof vi.fn>).mockReturnValue(uuid);
    const cached = {
      UUID: uuid,
      context: {} as Record<string, unknown>,
      displayName: 'Cached Switch',
    };
    platform.configureAccessory(cached as never);

    apiClient.discoverDevices.mockResolvedValue([
      device('switch_binary', [], { id: 1 }),
    ]);

    await platform.discoverDevices();

    expect(api.updatePlatformAccessories).toHaveBeenCalledWith([cached]);
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(SwitchAccessory).toHaveBeenCalledTimes(1);
  });

  it('preserves cached accessories when discovery is aborted', async () => {
    const { platform, api, apiClient } = buildPlatform();
    const cached = {
      UUID: 'uuid-cached',
      context: {} as Record<string, unknown>,
      displayName: 'Cached Device',
    };
    platform.configureAccessory(cached as never);

    apiClient.discoverDevices.mockResolvedValue(undefined);

    await platform.discoverDevices();

    expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
  });

  it('unregisters accessories that are no longer present in a fresh discovery', async () => {
    const { platform, api, apiClient } = buildPlatform();
    const stale = {
      UUID: 'uuid-stale',
      context: {} as Record<string, unknown>,
      displayName: 'Stale Device',
    };
    platform.configureAccessory(stale as never);

    apiClient.discoverDevices.mockResolvedValue([]);

    await platform.discoverDevices();

    expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      [stale]
    );
  });
});
