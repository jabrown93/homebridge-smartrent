import { DeviceData } from './base.js';

export type ThermostatFanMode = 'auto' | 'on';
export type ThermostatMode = 'off' | 'cool' | 'heat' | 'auto';
export type ThermostatOperatingState =
  'cooling' | 'fan_only' | 'heating' | 'idle' | 'off';

export type ThermostatData = DeviceData<'thermostat', false>;
