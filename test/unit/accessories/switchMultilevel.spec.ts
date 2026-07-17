import { beforeEach, describe, expect, it } from 'vitest';
import { SwitchMultilevelAccessory } from '../../../src/accessories/switchMultilevel.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, switchMultilevelDevice } from '../helpers/fixtures.js';

describe('SwitchMultilevelAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let switchAccessory: SwitchMultilevelAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(switchMultilevelDevice());
    switchAccessory = new SwitchMultilevelAccessory(platform, accessory);
  });

  it('GET On derives on-state from a positive level', async () => {
    platform.smartRentApi.getState.mockResolvedValue(attributes(['level', 60]));
    await expect(switchAccessory.handleOnGet()).resolves.toBe(1);
  });

  it('GET On derives off-state from a zero level', async () => {
    platform.smartRentApi.getState.mockResolvedValue(attributes(['level', 0]));
    await expect(switchAccessory.handleOnGet()).resolves.toBe(0);
  });

  it('GET Brightness returns the raw level', async () => {
    platform.smartRentApi.getState.mockResolvedValue(attributes(['level', 42]));
    await expect(switchAccessory.handleBrightnessGet()).resolves.toBe(42);
  });

  it('SET On (true) patches level to 100', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['level', 100])
    );
    await switchAccessory.handleOnSet(true);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '101', [
      { name: 'level', state: 100 },
    ]);
  });

  it('SET On (false) patches level to 0', async () => {
    platform.smartRentApi.setState.mockResolvedValue(attributes(['level', 0]));
    await switchAccessory.handleOnSet(false);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '101', [
      { name: 'level', state: 0 },
    ]);
  });

  it('SET Brightness patches the numeric level', async () => {
    platform.smartRentApi.setState.mockResolvedValue(attributes(['level', 77]));
    await switchAccessory.handleBrightnessSet(77);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '101', [
      { name: 'level', state: 77 },
    ]);
  });

  it('a websocket "level" event updates Brightness and derives On', async () => {
    const service = accessory.getService(Service.Lightbulb)!;
    await switchAccessory.handleDeviceStateChanged({
      name: 'level',
      last_read_state: '55',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.Brightness).updateValue
    ).toHaveBeenCalledWith(55);
    expect(
      service.getCharacteristic(Characteristic.On).updateValue
    ).toHaveBeenCalledWith(1);
  });

  it('a websocket "on" event updates the On characteristic', async () => {
    const service = accessory.getService(Service.Lightbulb)!;
    await switchAccessory.handleDeviceStateChanged({
      name: 'on',
      last_read_state: 'true',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.On).updateValue
    ).toHaveBeenCalledWith(1);
  });
});
