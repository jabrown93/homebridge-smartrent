import { CharacteristicValue, Service } from 'homebridge';
import { SmartRentPlatform } from '../platform.js';
import type { SmartRentAccessory } from './index.js';
import type { LockData } from '../devices/index.js';
import { WSEvent } from '../lib/client.js';
import { findStateByName } from '../lib/utils.js';

/**
 * Lock Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LockAccessory {
  private readonly service: Service;
  private readonly battery: Service;
  private writeQueue: Promise<unknown> = Promise.resolve();

  /*
   * Auto-lock model. Lock-state information arrives over two channels with no
   * ordering between them — HTTP command completions and websocket pushes —
   * plus a relock timer, so nothing learned at a command's *completion* can be
   * trusted to describe the present. Two rules keep this safe:
   *
   * 1. Asymmetry: command paths only ever ensure the relock timer exists
   *    (_armAutoLock, idempotent); they never cancel or restart it. Only a
   *    websocket observation of the door being locked cancels it. Arming on
   *    stale information is harmless — worst case a redundant lock command on
   *    an already-locked door. Cancelling on stale information is what leaves
   *    the door unlocked with nothing scheduled.
   *
   * 2. autoLockGeneration invalidates relocks that are queued but not yet
   *    executed. It is bumped only alongside an action that leaves a valid
   *    successor behind: arming/keeping a timer (an unlock command or
   *    observation) or observing the door locked (which makes any relock
   *    moot). The timer captures the generation when it FIRES, not when it is
   *    armed, so a bump can never strand an armed timer.
   *
   * A failed relock re-arms the timer, so relocking retries until the door is
   * observed locked. An explicit lock command deliberately touches neither the
   * timer nor the generation: its websocket confirmation cancels the timer,
   * and if the command fails, the still-armed timer secures the door.
   */
  private relockTimer?: NodeJS.Timeout;
  private autoLockGeneration: number = 0;

  private readonly state: {
    hubId: string;
    deviceId: string;
    locked: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
  };

  constructor(
    private readonly platform: SmartRentPlatform,
    private readonly accessory: SmartRentAccessory
  ) {
    this.state = {
      hubId: this.accessory.context.device.room.hub_id.toString(),
      deviceId: this.accessory.context.device.id.toString(),
      locked: {
        current: this.platform.api.hap.Characteristic.LockTargetState.UNSECURED,
        target: this.platform.api.hap.Characteristic.LockTargetState.UNSECURED,
      },
    };

    // set accessory information
    this.accessory
      .getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.api.hap.Characteristic.SerialNumber,
        this.accessory.context.device.id.toString()
      );

    // set the battery level service for the lock accessory
    this.battery =
      this.accessory.getService(this.platform.api.hap.Service.Battery) ||
      this.accessory.addService(this.platform.api.hap.Service.Battery);
    this.battery
      .getCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel)
      .onGet(this.handleBatteryLevelGet.bind(this));

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    this.service =
      this.accessory.getService(this.platform.api.hap.Service.LockMechanism) ||
      this.accessory.addService(this.platform.api.hap.Service.LockMechanism);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    // see https://developers.homebridge.io/#/service/LockMechanism
    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.LockCurrentState)
      .onGet(this.handleLockCurrentStateGet.bind(this));

    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.LockTargetState)
      .onGet(this.handleLockTargetStateGet.bind(this))
      .onSet(this.handleLockTargetStateSet.bind(this));

    // subscribe to the lock state change event
    this.platform.smartRentApi.websocket.event[this.state.deviceId] =
      this.handleLockEvent.bind(this);
  }

  /**
   * Handle requests to get the current value of the "Battery Level" characteristic
   */
  async handleBatteryLevelGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET BatteryLevel');
    const lockData = await this.platform.smartRentApi.getData<LockData>(
      this.state.hubId,
      this.state.deviceId
    );
    this.platform.log.debug('Lock Data', lockData);
    return Math.round(Number(lockData.battery_level));
  }

  private readonly LOCKED: string = 'locked';

  /**
   * Handle requests to get the current value of the "Lock Current State" characteristic
   */
  async handleLockCurrentStateGet(): Promise<CharacteristicValue> {
    this.platform.log.debug(
      'Triggered GET LockCurrentState Start',
      this.state.locked.current
    );
    const lockAttributes = await this.platform.smartRentApi.getState<LockData>(
      this.state.hubId,
      this.state.deviceId
    );
    const locked = findStateByName(lockAttributes, this.LOCKED) as string;
    this.platform.log.debug('Lock Attributes', JSON.stringify(lockAttributes));
    const currentValue =
      locked === 'true'
        ? this.platform.api.hap.Characteristic.LockTargetState.SECURED
        : this.platform.api.hap.Characteristic.LockTargetState.UNSECURED;
    this.state.locked.current = currentValue;
    this.platform.log.debug(
      'Triggered GET LockCurrentState Done',
      this.state.locked.current
    );
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Lock Target State" characteristic
   */
  async handleLockTargetStateGet(): Promise<CharacteristicValue> {
    this.platform.log.debug(
      'Triggered GET LockTargetState',
      this.state.locked.target
    );
    const lockAttributes = await this.platform.smartRentApi.getState<LockData>(
      this.state.hubId,
      this.state.deviceId
    );
    const locked = findStateByName(lockAttributes, this.LOCKED) as string;
    return locked === 'true'
      ? this.platform.api.hap.Characteristic.LockTargetState.SECURED
      : this.platform.api.hap.Characteristic.LockTargetState.UNSECURED;
  }

  /**
   * Handle requests to set the "Lock Target State" characteristic
   */
  async handleLockTargetStateSet(value: CharacteristicValue): Promise<void> {
    if (
      value === this.platform.api.hap.Characteristic.LockTargetState.UNSECURED
    ) {
      // Arm at issue time, when this is by definition the newest intention.
      // If the PATCH later fails the timer just issues a redundant lock.
      this.autoLockGeneration++;
      this._armAutoLock();
    }
    await this._enqueue(() => this._setLockTargetState(value));
  }

  /**
   * Chain onto the write queue so at most one setState PATCH for this lock is
   * ever in flight. That guarantees requests reach the hub in the order they
   * were issued, so completion order matches issue order by construction.
   */
  private _enqueue(command: () => Promise<unknown>) {
    const result = this.writeQueue.catch(() => undefined).then(command);
    this.writeQueue = result;
    return result;
  }

  private async _setLockTargetState(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET LockTargetState:', value);
    this.state.locked.target = value;
    const attributes = [{ name: this.LOCKED, state: !!value }];
    const lockAttributes = await this.platform.smartRentApi.setState<LockData>(
      this.state.hubId,
      this.state.deviceId,
      attributes
    );
    if (
      value === this.platform.api.hap.Characteristic.LockTargetState.UNSECURED
    ) {
      // The unlock has now actually been applied, superseding any relock
      // still queued from before it. Arm-only (rule 1): if a timer is
      // already running it stays, preserving its earlier deadline.
      this.autoLockGeneration++;
      this._armAutoLock();
    }
    this.platform.log.debug('Completed SET LockTargetState:', lockAttributes);
  }

  /** Ensure a relock timer is running. Idempotent; never restarts or cancels. */
  private _armAutoLock() {
    if (
      !this.platform.config.enableAutoLock ||
      !this.platform.config.autoLockDelayInMinutes ||
      this.relockTimer
    ) {
      return;
    }
    this.platform.log.debug(
      'Lock is unlocked, starting timer to relock in ',
      this.platform.config.autoLockDelayInMinutes,
      ' minutes'
    );
    this.relockTimer = setTimeout(
      () => this._fireAutoLock(),
      this.platform.config.autoLockDelayInMinutes * 60 * 1000
    );
  }

  private _cancelAutoLock() {
    if (this.relockTimer) {
      this.platform.log.debug('Lock is locked, clearing timer');
      clearTimeout(this.relockTimer);
      this.relockTimer = undefined;
    }
  }

  private _fireAutoLock() {
    // The timer has fired, so a new one may be armed from here on; whether
    // *this* relock still applies is the generation check's job, made at the
    // front of the write queue — the last moment before the PATCH is issued.
    this.relockTimer = undefined;
    const generation = this.autoLockGeneration;
    this._enqueue(async () => {
      if (generation !== this.autoLockGeneration) {
        this.platform.log.debug('Auto-relock superseded before it ran');
        return;
      }
      this.platform.log.debug('Relocking lock');
      await this._setLockTargetState(
        this.platform.api.hap.Characteristic.LockTargetState.SECURED
      );
    }).catch(err => {
      this.platform.log.error('Failed to auto-relock', err);
      // Retry only if nothing fresher arrived while the PATCH was in flight;
      // an observation or applied unlock advances the generation and owns the
      // timer from then on (e.g. the door was seen locked despite the error).
      if (generation === this.autoLockGeneration) {
        this._armAutoLock();
      }
    });
  }

  /**
   * Handle lock websocket events
   */
  async handleLockEvent(event: WSEvent) {
    this.platform.log.debug('Received event on Lock: ', event);
    if (event.name !== this.LOCKED) {
      return;
    }

    const currentValue =
      event.last_read_state === 'true'
        ? this.platform.api.hap.Characteristic.LockTargetState.SECURED
        : this.platform.api.hap.Characteristic.LockTargetState.UNSECURED;
    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.LockCurrentState,
      currentValue
    );
    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.LockTargetState,
      currentValue
    );

    // An observation is the freshest information there is: it supersedes any
    // queued relock, and it is the ONE thing allowed to cancel the timer.
    this.autoLockGeneration++;
    if (
      currentValue ===
      this.platform.api.hap.Characteristic.LockTargetState.UNSECURED
    ) {
      this._armAutoLock();
    } else {
      this._cancelAutoLock();
    }
  }
}
