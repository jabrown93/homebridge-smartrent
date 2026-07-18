import { beforeEach, describe, expect, it } from 'vitest';
import { LeakSensorAccessory } from '../../../src/accessories/leakSensor.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, leakSensorDevice } from '../helpers/fixtures.js';

describe('LeakSensorAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let leakAccessory: LeakSensorAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(leakSensorDevice());
    leakAccessory = new LeakSensorAccessory(platform, accessory);
  });

  it('GET LeakDetected maps "true" to LEAK_DETECTED', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['leak', 'true'])
    );
    await expect(leakAccessory.handleLeakDetected()).resolves.toBe(
      Characteristic.LeakDetected.LEAK_DETECTED
    );
  });

  it('GET LeakDetected maps "false" to LEAK_NOT_DETECTED', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['leak', 'false'])
    );
    await expect(leakAccessory.handleLeakDetected()).resolves.toBe(
      Characteristic.LeakDetected.LEAK_NOT_DETECTED
    );
  });

  it('a websocket "leak" event updates the LeakDetected characteristic', () => {
    const service = accessory.getService(Service.LeakSensor)!;
    leakAccessory.handleDeviceStateChanged({
      name: 'leak',
      last_read_state: 'true',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.LeakDetected).updateValue
    ).toHaveBeenCalledWith(Characteristic.LeakDetected.LEAK_DETECTED);
  });

  it('ignores websocket events for other attributes', () => {
    const service = accessory.getService(Service.LeakSensor)!;
    leakAccessory.handleDeviceStateChanged({
      name: 'battery_level',
      last_read_state: '80',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.LeakDetected).updateValue
    ).not.toHaveBeenCalled();
  });
});
