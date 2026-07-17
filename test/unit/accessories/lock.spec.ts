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

  describe('auto-relock races', () => {
    const DELAY_MINUTES = 5;
    const DELAY = DELAY_MINUTES * 60 * 1000;

    /** Rebuilds the accessory on a platform with auto-lock switched on. */
    function withAutoLock() {
      platform = createMockPlatform({
        enableAutoLock: true,
        autoLockDelayInMinutes: DELAY_MINUTES,
      });
      accessory = createMockAccessory(lockDevice());
      lockAccessory = new LockAccessory(platform, accessory);
    }

    /**
     * Records every PATCH with the (fake) clock time it was issued at, and
     * lets one relock PATCH be held pending. The real REST client sets no
     * axios timeout, so a relock genuinely can stay in flight past the
     * auto-lock delay.
     */
    function recordSetState() {
      const calls: { locked: boolean; at: number }[] = [];
      let release!: () => void;
      const pending = new Promise<void>(resolve => (release = resolve));
      let held = false;

      const holdNextRelock = (andThenFail = false) => {
        platform.smartRentApi.setState.mockImplementation(
          async (_hub: string, _dev: string, attrs: { state: unknown }[]) => {
            const locked = attrs[0].state as boolean;
            calls.push({ locked, at: Date.now() });
            if (locked && !held) {
              held = true;
              await pending;
              if (andThenFail) {
                throw new Error('transient SmartRent outage');
              }
            }
            return attributes(['locked', String(locked)]);
          }
        );
      };

      return { calls, release: () => release(), holdNextRelock };
    }

    it('honors a full delay from the latest unlock when a relock is still in flight', async () => {
      vi.useFakeTimers();
      withAutoLock();
      const { calls, release, holdNextRelock } = recordSetState();
      holdNextRelock();

      // Unlock, then let the auto-relock fire. Its PATCH hangs.
      await lockAccessory.handleLockTargetStateSet(
        Characteristic.LockTargetState.UNSECURED
      );
      await vi.advanceTimersByTimeAsync(DELAY);

      // The user unlocks again -- queued behind the hung relock -- and the hub
      // pushes an event confirming the door is still open.
      const queuedUnlock = lockAccessory.handleLockTargetStateSet(
        Characteristic.LockTargetState.UNSECURED
      );
      lockAccessory.handleLockEvent({
        name: 'locked',
        last_read_state: 'false',
      } as never);

      // That event arms a fresh timer, which also fires while the first relock
      // is still hung, queueing a second relock behind the user's unlock.
      await vi.advanceTimersByTimeAsync(DELAY);

      release();
      await queuedUnlock;
      await vi.advanceTimersByTimeAsync(0);

      // The superseded relock must not apply on the heels of the unlock...
      const lastUnlock = calls.map(c => c.locked).lastIndexOf(false);
      expect(lastUnlock).toBeGreaterThan(-1);
      expect(calls.slice(lastUnlock + 1)).toEqual([]);

      // ...but the door must still relock, a full delay later.
      await vi.advanceTimersByTimeAsync(DELAY);
      const relock = calls.slice(lastUnlock + 1).find(c => c.locked);
      expect(relock).toBeDefined();
      expect(relock!.at - calls[lastUnlock].at).toBeGreaterThanOrEqual(DELAY);
    });

    it('still relocks when an unlock event arrives while a relock is pending and that relock then fails', async () => {
      vi.useFakeTimers();
      withAutoLock();
      const { calls, release, holdNextRelock } = recordSetState();
      holdNextRelock(true);

      await lockAccessory.handleLockTargetStateSet(
        Characteristic.LockTargetState.UNSECURED
      );
      await vi.advanceTimersByTimeAsync(DELAY);

      // Door reported still unlocked *while* the relock is in flight. Holding
      // the "timer armed" flag across that window would swallow this event.
      lockAccessory.handleLockEvent({
        name: 'locked',
        last_read_state: 'false',
      } as never);

      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls.filter(c => c.locked)).toHaveLength(1); // the failed one

      await vi.advanceTimersByTimeAsync(DELAY);
      expect(calls.filter(c => c.locked)).toHaveLength(2); // retried, not stuck
    });

    it('does not leave a failed auto-relock as an unhandled rejection', async () => {
      vi.useFakeTimers();
      withAutoLock();
      platform.smartRentApi.setState
        .mockResolvedValueOnce(attributes(['locked', 'false']))
        .mockRejectedValueOnce(new Error('transient SmartRent outage'));

      await lockAccessory.handleLockTargetStateSet(
        Characteristic.LockTargetState.UNSECURED
      );
      await expect(vi.advanceTimersByTimeAsync(DELAY)).resolves.not.toThrow();
      expect(platform.log.error).toHaveBeenCalledWith(
        'Failed to auto-relock',
        expect.any(Error)
      );
    });

    it('a websocket lock event cancels a pending auto-relock', async () => {
      vi.useFakeTimers();
      withAutoLock();
      platform.smartRentApi.setState.mockResolvedValue(
        attributes(['locked', 'false'])
      );

      await lockAccessory.handleLockTargetStateSet(
        Characteristic.LockTargetState.UNSECURED
      );
      // Someone locks the door by hand before the timer fires.
      lockAccessory.handleLockEvent({
        name: 'locked',
        last_read_state: 'true',
      } as never);
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(platform.smartRentApi.setState).toHaveBeenCalledTimes(1);
    });
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
