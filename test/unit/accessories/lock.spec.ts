import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LockAccessory } from '../../../src/accessories/lock.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, lockDevice } from '../helpers/fixtures.js';

describe('LockAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let lockAccessory: LockAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(lockDevice());
    lockAccessory = new LockAccessory(platform, accessory);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('GET BatteryLevel rounds the raw battery level', async () => {
    platform.smartRentApi.getData.mockResolvedValue(
      lockDevice({ battery_level: 87.6 })
    );
    await expect(lockAccessory.handleBatteryLevelGet()).resolves.toBe(88);
  });

  it('GET LockCurrentState maps "true" to SECURED', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['locked', 'true'])
    );
    await expect(lockAccessory.handleLockCurrentStateGet()).resolves.toBe(
      Characteristic.LockTargetState.SECURED
    );
  });

  it('GET LockCurrentState maps "false" to UNSECURED', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['locked', 'false'])
    );
    await expect(lockAccessory.handleLockCurrentStateGet()).resolves.toBe(
      Characteristic.LockTargetState.UNSECURED
    );
  });

  it('SET LockTargetState patches the "locked" attribute as a boolean', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['locked', 'true'])
    );
    await lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.SECURED
    );
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '103', [
      { name: 'locked', state: true },
    ]);
  });

  it('serializes overlapping SET calls so PATCHes are issued in order', async () => {
    const order: number[] = [];
    platform.smartRentApi.setState.mockImplementation(
      async (_hub: string, _dev: string, attrs: { state: unknown }[]) => {
        const value = attrs[0].state;
        order.push(value ? 1 : 0);
        return attributes(['locked', String(value)]);
      }
    );

    const first = lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.UNSECURED
    );
    const second = lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.SECURED
    );
    await Promise.all([first, second]);

    expect(order).toEqual([0, 1]);
    expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(2);
  });

  it('a queued write still completes after an earlier write rejects', async () => {
    platform.smartRentApi.setState
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(attributes(['locked', 'true']));

    const first = lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.UNSECURED
    );
    const second = lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.SECURED
    );

    await expect(first).rejects.toThrow('network error');
    await expect(second).resolves.toBeUndefined();
    expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(2);
  });

  it('auto-relocks after the configured delay when unlocked', async () => {
    vi.useFakeTimers();
    platform = createMockPlatform({
      enableAutoLock: true,
      autoLockDelayInMinutes: 5,
    });
    accessory = createMockAccessory(lockDevice());
    lockAccessory = new LockAccessory(platform, accessory);

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['locked', 'false'])
    );
    await lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.UNSECURED
    );
    expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(1);

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['locked', 'true'])
    );
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(2);
    expect(platform.smartRentApi.setState).toHaveBeenLastCalledWith(
      '42',
      '103',
      [{ name: 'locked', state: true }]
    );
  });

  it('does not schedule an auto-relock when the feature is disabled', async () => {
    vi.useFakeTimers();
    // default mock platform has no enableAutoLock/autoLockDelayInMinutes set
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['locked', 'false'])
    );
    await lockAccessory.handleLockTargetStateSet(
      Characteristic.LockTargetState.UNSECURED
    );

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(1);
  });

  it('a websocket lock event updates both Lock characteristics', () => {
    const service = accessory.getService(Service.LockMechanism)!;
    lockAccessory.handleLockEvent({
      name: 'locked',
      last_read_state: 'true',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.LockCurrentState).updateValue
    ).toHaveBeenCalledWith(Characteristic.LockTargetState.SECURED);
    expect(
      service.getCharacteristic(Characteristic.LockTargetState).updateValue
    ).toHaveBeenCalledWith(Characteristic.LockTargetState.SECURED);
  });

  it('ignores websocket events for other attributes', () => {
    const service = accessory.getService(Service.LockMechanism)!;
    lockAccessory.handleLockEvent({
      name: 'battery_level',
      last_read_state: '80',
    } as never);
    expect(
      service.getCharacteristic(Characteristic.LockCurrentState).updateValue
    ).not.toHaveBeenCalled();
  });
});
