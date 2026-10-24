export type TankSensorType = "ultrasonic" | "floats" | "pressure";

export interface TankConfig {
  sensorType: TankSensorType;
  totalHeightCm: number; // Height of the tank in cm
  minLevelPercent: number; // Below this %, refill/pumping activates
  maxLevelPercent: number; // Above this %, refill/pumping stops
}

export interface ArduinoPins {
  // Tank A
  tankATrigger: number;
  tankAEcho: number;
  tankAFloatLow: number;
  tankAFloatMed: number;
  tankAFloatHigh: number;
  tankAPressureAnalog: number;
  refillValve: number;

  // Tank B
  tankBTrigger: number;
  tankBEcho: number;
  tankBFloatLow: number;
  tankBFloatHigh: number;
  transferPump: number;
}

export type DisplayType = "serial" | "lcd1602" | "oled1306";

export interface SystemSettings {
  tankA: TankConfig;
  tankB: TankConfig;
  pins: ArduinoPins;
  displayType: DisplayType;
  safetyDryRun: boolean;      // Dry run safety on pump A -> B (disabled if Level A < 30%)
  safetyRefillTimeout: number; // Max time refill valve can be open in seconds (e.g. 60s, 0 is disabled)
  enableBTransfer: boolean;    // Enable optional transfer to Tank B
}

export interface SimulationState {
  waterLevelA: number; // Current simulated water level A (%)
  waterLevelB: number; // Current simulated water level B (%)
  refillValveOpen: boolean; // Valve currently refilling tank A
  transferPumpActive: boolean; // Pump transfering water from A to B
  errorState: "none" | "dry_run_pump" | "refill_timeout" | "sensor_error";
  simulationSpeed: number; // multiplier of time
  isAutoSimulating: boolean; // Whether simulation is actively running
}
