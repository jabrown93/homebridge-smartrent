import { vi } from 'vitest';
import type { SmartRentPlatform } from '../../../src/platform.js';
import type {
  AccessoryContext,
  SmartRentAccessory,
} from '../../../src/accessories/index.js';
import type { DeviceDataUnion } from '../../../src/devices/index.js';
import type { SmartRentPlatformConfig } from '../../../src/lib/config.js';

/**
 * Fake HAP Characteristic/Service "constants". Values don't need to match
 * real HAP numbering -- code under test and assertions both dereference
 * this same object, so identity is what matters.
 */
export const Characteristic = {
  On: 'On',
  Name: 'Name',
  SerialNumber: 'SerialNumber',
  Brightness: 'Brightness',
  BatteryLevel: 'BatteryLevel',
  CurrentTemperature: 'CurrentTemperature',
  TargetTemperature: 'TargetTemperature',
  CurrentRelativeHumidity: 'CurrentRelativeHumidity',
  CoolingThresholdTemperature: 'CoolingThresholdTemperature',
  HeatingThresholdTemperature: 'HeatingThresholdTemperature',
  LeakDetected: { LEAK_DETECTED: 1, LEAK_NOT_DETECTED: 0 },
  MotionDetected: 'MotionDetected',
  LockCurrentState: { SECURED: 1, UNSECURED: 0, JAMMED: 2, UNKNOWN: 3 },
  LockTargetState: { SECURED: 1, UNSECURED: 0 },
  CurrentHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2 },
  TargetHeatingCoolingState: { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 },
  TemperatureDisplayUnits: { FAHRENHEIT: 1, CELSIUS: 0 },
} as const;

export const Service = {
  AccessoryInformation: 'AccessoryInformation',
  Switch: 'Switch',
  Lightbulb: 'Lightbulb',
  Thermostat: 'Thermostat',
  Fan: 'Fan',
  LockMechanism: 'LockMechanism',
  Battery: 'Battery',
  LeakSensor: 'LeakSensor',
  MotionSensor: 'MotionSensor',
} as const;

/** Records onGet/onSet handlers per-characteristic so tests can invoke them directly. */
export class FakeCharacteristic {
  onGetHandler?: () => unknown;
  onSetHandler?: (value: unknown) => unknown;
  updateValue = vi.fn();

  onGet(fn: () => unknown) {
    this.onGetHandler = fn;
    return this;
  }

  onSet(fn: (value: unknown) => unknown) {
    this.onSetHandler = fn;
    return this;
  }
}

export class FakeService {
  private readonly characteristics = new Map<unknown, FakeCharacteristic>();
  setCharacteristic = vi.fn(() => this);
  updateCharacteristic = vi.fn((characteristic: unknown, value: unknown) => {
    this.getCharacteristic(characteristic).updateValue(value);
    return this;
  });

  getCharacteristic(characteristic: unknown): FakeCharacteristic {
    let handle = this.characteristics.get(characteristic);
    if (!handle) {
      handle = new FakeCharacteristic();
      this.characteristics.set(characteristic, handle);
    }
    return handle;
  }
}

/** Creates a fake PlatformAccessory backed by FakeService instances keyed by Service type. */
export function createMockAccessory(
  device: DeviceDataUnion
): SmartRentAccessory {
  // Real PlatformAccessory instances always carry an AccessoryInformation
  // service out of the box; accessory classes rely on that via `getService(...)!`.
  const services = new Map<unknown, FakeService>([
    [Service.AccessoryInformation, new FakeService()],
  ]);

  const accessory = {
    context: { device } as AccessoryContext,
    displayName: device.name,
    UUID: `uuid-${device.id}`,
    getService: vi.fn((serviceType: unknown) => services.get(serviceType)),
    addService: vi.fn((serviceType: unknown) => {
      const service = new FakeService();
      services.set(serviceType, service);
      return service;
    }),
  };

  return accessory as unknown as SmartRentAccessory;
}

/**
 * Bare accessory stub with an empty `context`, standing in for what
 * `new api.platformAccessory(name, uuid)` returns before `platform.ts`
 * populates `context.device` itself.
 */
export function createBarePlatformAccessory(name: string, uuid: string) {
  const services = new Map<unknown, FakeService>([
    [Service.AccessoryInformation, new FakeService()],
  ]);

  return {
    context: {} as Record<string, unknown>,
    displayName: name,
    UUID: uuid,
    getService: vi.fn((serviceType: unknown) => services.get(serviceType)),
    addService: vi.fn((serviceType: unknown) => {
      const service = new FakeService();
      services.set(serviceType, service);
      return service;
    }),
  };
}

export type MockSmartRentApi = {
  client: { getAccessToken: ReturnType<typeof vi.fn> };
  getState: ReturnType<typeof vi.fn>;
  getData: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  discoverDevices: ReturnType<typeof vi.fn>;
  websocket: { event: Record<string, (event: unknown) => void> };
};

/** Creates a fake SmartRentPlatform with a silent logger and a mocked smartRentApi. */
export function createMockPlatform(
  configOverrides: Partial<SmartRentPlatformConfig> = {}
): SmartRentPlatform & { smartRentApi: MockSmartRentApi } {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    success: vi.fn(),
  };

  const smartRentApi: MockSmartRentApi = {
    client: { getAccessToken: vi.fn() },
    getState: vi.fn(),
    getData: vi.fn(),
    setState: vi.fn(),
    discoverDevices: vi.fn(),
    websocket: { event: {} },
  };

  const platform = {
    log,
    config: {
      platform: 'SmartRent',
      email: 'test@example.com',
      password: 'password',
      ...configOverrides,
    } as SmartRentPlatformConfig,
    api: {
      hap: {
        Characteristic,
        Service,
        uuid: { generate: vi.fn((seed: string) => `uuid-${seed}`) },
      },
      serverVersion: '2.1.1',
      on: vi.fn(),
      user: { storagePath: vi.fn(() => '/fake/storage') },
      // Must stay a `function` expression, not an arrow function: platform.ts
      // calls this via `new this.api.platformAccessory(...)`, and arrow
      // functions can't be used as constructors.
      // eslint-disable-next-line prefer-arrow-callback
      platformAccessory: vi.fn().mockImplementation(function (
        name: string,
        uuid: string
      ) {
        return createBarePlatformAccessory(name, uuid);
      }),
      registerPlatformAccessories: vi.fn(),
      updatePlatformAccessories: vi.fn(),
      unregisterPlatformAccessories: vi.fn(),
    },
    accessories: [],
    smartRentApi,
  };

  return platform as unknown as SmartRentPlatform & {
    smartRentApi: MockSmartRentApi;
  };
}
