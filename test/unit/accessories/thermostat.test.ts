import { beforeEach, describe, expect, it } from 'vitest';
import { ThermostatAccessory } from '../../../src/accessories/thermostat.js';
import {
  Characteristic,
  createMockAccessory,
  createMockPlatform,
  Service,
} from '../helpers/hap.js';
import { attributes, thermostatDevice } from '../helpers/fixtures.js';

/** Reaches into private handleDeviceStateChanged -- the only way to drive websocket events. */
function dispatchEvent(
  accessory: ThermostatAccessory,
  event: { name: string; last_read_state: string }
) {
  (
    accessory as unknown as {
      handleDeviceStateChanged(e: typeof event): void;
    }
  ).handleDeviceStateChanged(event);
}

describe('ThermostatAccessory', () => {
  let platform: ReturnType<typeof createMockPlatform>;
  let accessory: ReturnType<typeof createMockAccessory>;
  let thermostatAccessory: ThermostatAccessory;

  beforeEach(() => {
    platform = createMockPlatform();
    accessory = createMockAccessory(thermostatDevice());
    thermostatAccessory = new ThermostatAccessory(platform, accessory);
  });

  it('GET CurrentTemperature converts Fahrenheit to Celsius', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['current_temp', 68])
    );
    await expect(
      thermostatAccessory.handleCurrentTemperatureGet()
    ).resolves.toBe(20);
  });

  it('GET TargetTemperature reads the cool setpoint when mode is cool', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(
        ['mode', 'cool'],
        ['cool_target_temp', 68],
        ['heat_target_temp', 77]
      )
    );
    await expect(
      thermostatAccessory.handleTargetTemperatureGet()
    ).resolves.toBe(20);
  });

  it('GET TargetTemperature reads the heat setpoint when mode is auto', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(
        ['mode', 'auto'],
        ['cool_target_temp', 68],
        ['heat_target_temp', 77]
      )
    );
    await expect(
      thermostatAccessory.handleTargetTemperatureGet()
    ).resolves.toBe(25);
  });

  it('SET TargetTemperature patches cool_target_temp while target mode is OFF (default)', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['cool_target_temp', 68])
    );
    await thermostatAccessory.handleTargetTemperatureSet(20);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '102', [
      { name: 'cool_target_temp', state: 68 },
    ]);
  });

  it('SET TargetTemperature patches heat_target_temp once target mode is HEAT', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['mode', 'heat'])
    );
    await thermostatAccessory.handleTargetHeatingCoolingStateSet(
      Characteristic.TargetHeatingCoolingState.HEAT
    );

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['heat_target_temp', 77])
    );
    await thermostatAccessory.handleTargetTemperatureSet(25);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '102', [
      { name: 'heat_target_temp', state: 77 },
    ]);
  });

  it('SET TargetTemperature sends no attributes once target mode is AUTO', async () => {
    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['mode', 'auto'])
    );
    await thermostatAccessory.handleTargetHeatingCoolingStateSet(
      Characteristic.TargetHeatingCoolingState.AUTO
    );

    platform.smartRentApi.setState.mockClear();
    platform.smartRentApi.setState.mockResolvedValue(attributes());
    await thermostatAccessory.handleTargetTemperatureSet(20);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith(
      '42',
      '102',
      []
    );
  });

  it('GET CurrentHeatingCoolingState prefers operating_state over mode', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['operating_state', 'cooling'], ['mode', 'heat'])
    );
    await expect(
      thermostatAccessory.handleCurrentHeatingCoolingStateGet()
    ).resolves.toBe(Characteristic.CurrentHeatingCoolingState.COOL);
  });

  it('GET CurrentHeatingCoolingState falls back to mode when operating_state is absent', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['mode', 'heat'])
    );
    await expect(
      thermostatAccessory.handleCurrentHeatingCoolingStateGet()
    ).resolves.toBe(Characteristic.CurrentHeatingCoolingState.HEAT);
  });

  it('GET/SET fan On maps fan_mode "on"/"auto" to boolean and back', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['fan_mode', 'on'])
    );
    await expect(thermostatAccessory.handleOnGet()).resolves.toBe(true);

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['fan_mode', 'auto'])
    );
    await thermostatAccessory.handleOnSet(false);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '102', [
      { name: 'fan_mode', state: 'auto' },
    ]);
  });

  it('GET TemperatureDisplayUnits always returns FAHRENHEIT', async () => {
    await expect(
      thermostatAccessory.handleTemperatureDisplayUnitsGet()
    ).resolves.toBe(Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
  });

  it('SET TemperatureDisplayUnits is a no-op', async () => {
    await expect(
      thermostatAccessory.handleTemperatureDisplayUnitsSet(
        Characteristic.TemperatureDisplayUnits.CELSIUS
      )
    ).resolves.toBeUndefined();
  });

  it('GET CurrentRelativeHumidity returns the raw humidity attribute', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['current_humidity', 42])
    );
    await expect(
      thermostatAccessory.handleCurrentRelativeHumidityGet()
    ).resolves.toBe(42);
  });

  it('GET/SET CoolingThresholdTemperature converts Fahrenheit to/from Celsius', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['cool_target_temp', 68])
    );
    await expect(
      thermostatAccessory.handleCoolingThresholdTemperatureGet()
    ).resolves.toBe(20);

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['cool_target_temp', 77])
    );
    await thermostatAccessory.handleCoolingThresholdTemperatureSet(25);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '102', [
      { name: 'cool_target_temp', state: 77 },
    ]);
  });

  it('GET/SET HeatingThresholdTemperature converts Fahrenheit to/from Celsius', async () => {
    platform.smartRentApi.getState.mockResolvedValue(
      attributes(['heat_target_temp', 68])
    );
    await expect(
      thermostatAccessory.handleHeatingThresholdTemperatureGet()
    ).resolves.toBe(20);

    platform.smartRentApi.setState.mockResolvedValue(
      attributes(['heat_target_temp', 77])
    );
    await thermostatAccessory.handleHeatingThresholdTemperatureSet(25);
    expect(platform.smartRentApi.setState).toHaveBeenCalledWith('42', '102', [
      { name: 'heat_target_temp', state: 77 },
    ]);
  });

  it('websocket mode=auto derives COOL when the target is below the current temperature', async () => {
    platform.smartRentApi.getState.mockResolvedValueOnce(
      attributes(['current_temp', 80])
    );
    await thermostatAccessory.handleCurrentTemperatureGet();
    platform.smartRentApi.getState.mockResolvedValueOnce(
      attributes(['mode', 'cool'], ['cool_target_temp', 68])
    );
    await thermostatAccessory.handleTargetTemperatureGet();

    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'mode',
      last_read_state: 'auto',
    });

    expect(
      thermostatService.getCharacteristic(
        Characteristic.CurrentHeatingCoolingState
      ).updateValue
    ).toHaveBeenCalledWith(Characteristic.CurrentHeatingCoolingState.COOL);
    expect(
      thermostatService.getCharacteristic(
        Characteristic.TargetHeatingCoolingState
      ).updateValue
    ).toHaveBeenCalledWith(Characteristic.TargetHeatingCoolingState.AUTO);
  });

  it('websocket operating_state event updates CurrentHeatingCoolingState directly', () => {
    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'operating_state',
      last_read_state: 'heating',
    });
    expect(
      thermostatService.getCharacteristic(
        Characteristic.CurrentHeatingCoolingState
      ).updateValue
    ).toHaveBeenCalledWith(Characteristic.CurrentHeatingCoolingState.HEAT);
  });

  it("websocket fan_mode event updates the fan's On characteristic", () => {
    const fanService = accessory.getService(Service.Fan)!;
    dispatchEvent(thermostatAccessory, {
      name: 'fan_mode',
      last_read_state: 'on',
    });
    expect(
      fanService.getCharacteristic(Characteristic.On).updateValue
    ).toHaveBeenCalledWith(true);
  });

  it('websocket current_temp event converts to Celsius', () => {
    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'current_temp',
      last_read_state: '68',
    });
    expect(
      thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
        .updateValue
    ).toHaveBeenCalledWith(20);
  });

  it('websocket cooling_setpoint event converts to Celsius', () => {
    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'cooling_setpoint',
      last_read_state: '68',
    });
    expect(
      thermostatService.getCharacteristic(
        Characteristic.CoolingThresholdTemperature
      ).updateValue
    ).toHaveBeenCalledWith(20);
  });

  it('websocket heating_setpoint event converts to Celsius', () => {
    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'heating_setpoint',
      last_read_state: '68',
    });
    expect(
      thermostatService.getCharacteristic(
        Characteristic.HeatingThresholdTemperature
      ).updateValue
    ).toHaveBeenCalledWith(20);
  });

  it('websocket current_humidity event rounds to the nearest integer', () => {
    const thermostatService = accessory.getService(Service.Thermostat)!;
    dispatchEvent(thermostatAccessory, {
      name: 'current_humidity',
      last_read_state: '55.6',
    });
    expect(
      thermostatService.getCharacteristic(
        Characteristic.CurrentRelativeHumidity
      ).updateValue
    ).toHaveBeenCalledWith(56);
  });
});
