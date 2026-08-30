import { CharacteristicValue, Service } from 'homebridge';
import { SmartRentPlatform } from '../platform.js';
import type { SmartRentAccessory } from './index.js';
import { WSEvent } from '../lib/client.js';
import { findStateByName } from '../lib/utils.js';

/**
 * Motion Sensor Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MotionSensorAccessory {
  private readonly service: Service;

  private readonly state: {
    hubId: string;
    deviceId: string;
    motion: {
      current: CharacteristicValue;
    };
  };

  constructor(
    private readonly platform: SmartRentPlatform,
    private readonly accessory: SmartRentAccessory
  ) {
    this.state = {
      hubId: this.accessory.context.device.room.hub_id.toString(),
      deviceId: this.accessory.context.device.id.toString(),
      motion: {
        current: false,
      },
    };

    // set accessory information
    this.accessory
      .getService(this.platform.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.api.hap.Characteristic.SerialNumber,
        this.accessory.context.device.id.toString()
      );

    // get the MotionSensor service if it exists, otherwise create a new MotionSensor service
    this.service =
      this.accessory.getService(this.platform.api.hap.Service.MotionSensor) ||
      this.accessory.addService(this.platform.api.hap.Service.MotionSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.api.hap.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    // see https://developers.homebridge.io/#/service/MotionSensor
    this.service
      .getCharacteristic(this.platform.api.hap.Characteristic.MotionDetected)
      .onGet(this.handleMotionDetectedGet.bind(this));

    // subscribe to device events
    this.platform.smartRentApi.websocket.event[this.state.deviceId] = (
      event: WSEvent
    ) => this.handleDeviceStateChanged(event);
  }

  /**
   * Handle requests to get the current value of the "Motion Detected" characteristic
   */
  async handleMotionDetectedGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET MotionDetected');
    const motionAttributes = await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    );
    const motion =
      findStateByName(motionAttributes, 'motion_binary') === 'true';
    this.state.motion.current = motion;
    return motion;
  }

  /**
   * Handle device state changed events
   * @param event
   */
  handleDeviceStateChanged(event: WSEvent) {
    this.platform.log.debug('Received websocket motion event:', event);

    if (event.name !== 'motion_binary') {
      return;
    }
    const motion = event.last_read_state === 'true';
    this.state.motion.current = motion;
    this.service.updateCharacteristic(
      this.platform.api.hap.Characteristic.MotionDetected,
      motion
    );
  }
}
