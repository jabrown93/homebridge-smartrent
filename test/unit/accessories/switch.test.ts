import { beforeEach, describe, expect, it } from 'vitest';
import { SwitchAccessory } from '../../../src/accessories/switch.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, switchDevice } from '../helpers/fixtures.js';

describe('SwitchAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let switchAccessory: SwitchAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(switchDevice());
    switchAccessory = new SwitchAccessory(platform, accessory);
  });

  it('registers a websocket handler for the device', () => {
    expect(
      platform.smartRentApi.websocket.event[String(switchDevice().id)]
    ).toBeTypeOf('function');
  });

  it('GET On maps a "true" attribute state to 1', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['on', 'true'])
    );
    await expect(switchAccessory.handleOnGet()).resolves.toBe(1);
  });

  it('GET On maps a "false" attribute state to 0', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['on', 'false'])
    );
    await expect(switchAccessory.handleOnGet()).resolves.toBe(0);
  });

  it('SET On patches the "on" attribute as a boolean', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['on', 'true'])
    );
    await switchAccessory.handleOnSet(true);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '100', [
      { name: 'on', state: true },
    ]);
  });

  it('a websocket "on" event updates the On characteristic', async () => {
    const service = accessory.getService(Service.Switch)!;
    await switchAccessory.handleDeviceStateChanged({
      name: 'on',
      last_read_state: 'true',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.On).updateValue
    ).toHaveBeenCalledWith(0);
  });

  it('ignores websocket events for other attributes', async () => {
    const service = accessory.getService(Service.Switch)!;
    await switchAccessory.handleDeviceStateChanged({
      name: 'level',
      last_read_state: '50',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.On).updateValue
    ).not.toHaveBeenCalled();
  });
});
