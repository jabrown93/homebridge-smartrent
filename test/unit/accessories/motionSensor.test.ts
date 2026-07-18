import { beforeEach, describe, expect, it } from 'vitest';
import { MotionSensorAccessory } from '../../../src/accessories/motionSensor.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, motionSensorDevice } from '../helpers/fixtures.js';

describe('MotionSensorAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let motionAccessory: MotionSensorAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(motionSensorDevice());
    motionAccessory = new MotionSensorAccessory(platform, accessory);
  });

  it('GET MotionDetected maps "true" to true', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['motion_binary', 'true'])
    );
    await expect(motionAccessory.handleMotionDetectedGet()).resolves.toBe(true);
  });

  it('GET MotionDetected maps "false" to false', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['motion_binary', 'false'])
    );
    await expect(motionAccessory.handleMotionDetectedGet()).resolves.toBe(
      false
    );
  });

  it('a websocket "motion_binary" event updates the MotionDetected characteristic', () => {
    const service = accessory.getService(Service.MotionSensor)!;
    motionAccessory.handleDeviceStateChanged({
      name: 'motion_binary',
      last_read_state: 'true',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.MotionDetected).updateValue
    ).toHaveBeenCalledWith(true);
  });

  it('ignores websocket events for other attributes', () => {
    const service = accessory.getService(Service.MotionSensor)!;
    motionAccessory.handleDeviceStateChanged({
      name: 'battery_level',
      last_read_state: '80',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.MotionDetected).updateValue
    ).not.toHaveBeenCalled();
  });
});
