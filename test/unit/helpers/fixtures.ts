import type { DeviceAttribute } from '../../../src/devices/index.js';
import type { LeakSensorData } from '../../../src/devices/leakSensor.js';
import type { LockData } from '../../../src/devices/lock.js';
import type { MotionSensorData } from '../../../src/devices/motionSensor.js';
import type { SwitchData } from '../../../src/devices/switch.js';
import type { SwitchMultilevelData } from '../../../src/devices/switchMultilevel.js';
import type { ThermostatData } from '../../../src/devices/thermostat.js';

export function attributes(
  ...pairs: Array<[string, DeviceAttribute['state']]>
): DeviceAttribute[] {
  return pairs.map(([name, state]) => ({ name, state }));
}

const baseRoom = {
  icon: null,
  id: 1,
  name: 'Living Room',
  hub_id: 42,
  inserted_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const baseFields = {
  icon: null,
  inserted_at: '2024-01-01T00:00:00Z',
  online: true,
  pending_update: false,
  primary_lock: false,
  room: baseRoom,
  show_on_dashboard: true,
  updated_at: '2024-01-01T00:00:00Z',
  valid_config: true,
  warning: false,
};

export function switchDevice(overrides: Partial<SwitchData> = {}): SwitchData {
  return {
    ...baseFields,
    battery_level: null,
    battery_powered: false,
    attributes: attributes(['on', 'false']),
    id: 100,
    name: 'Test Switch',
    type: 'switch_binary',
    ...overrides,
  };
}

export function switchMultilevelDevice(
  overrides: Partial<SwitchMultilevelData> = {}
): SwitchMultilevelData {
  return {
    ...baseFields,
    battery_level: null,
    battery_powered: false,
    attributes: attributes(['on', 'false'], ['level', 0]),
    id: 101,
    name: 'Test Dimmer',
    type: 'switch_multilevel',
    ...overrides,
  };
}

export function thermostatDevice(
  overrides: Partial<ThermostatData> = {}
): ThermostatData {
  return {
    ...baseFields,
    battery_level: null,
    battery_powered: false,
    attributes: attributes(
      ['mode', 'off'],
      ['operating_state', 'idle'],
      ['fan_mode', 'auto'],
      ['current_temp', 70],
      ['current_humidity', 40],
      ['cool_target_temp', 75],
      ['heat_target_temp', 65]
    ),
    id: 102,
    name: 'Test Thermostat',
    type: 'thermostat',
    ...overrides,
  };
}

export function lockDevice(overrides: Partial<LockData> = {}): LockData {
  return {
    ...baseFields,
    battery_level: 90,
    battery_powered: true,
    attributes: attributes(['locked', 'false']),
    id: 103,
    name: 'Test Lock',
    type: 'entry_control',
    ...overrides,
  };
}

export function leakSensorDevice(
  overrides: Partial<LeakSensorData> = {}
): LeakSensorData {
  return {
    ...baseFields,
    battery_level: 80,
    battery_powered: true,
    attributes: attributes(['leak', 'false']),
    id: 104,
    name: 'Test Leak Sensor',
    type: 'sensor_notification',
    ...overrides,
  };
}

export function motionSensorDevice(
  overrides: Partial<MotionSensorData> = {}
): MotionSensorData {
  return {
    ...baseFields,
    battery_level: 80,
    battery_powered: true,
    attributes: attributes(['motion_binary', 'false']),
    id: 105,
    name: 'Test Motion Sensor',
    type: 'sensor_notification',
    ...overrides,
  };
}
