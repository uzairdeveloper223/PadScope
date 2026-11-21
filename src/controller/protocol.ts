import { emptyState } from './state.ts';
import type { Contact, ControllerState, Family, Transport, Vector3 } from './state.ts';

// Report layouts: Sony HID specifications and the documented Linux
// hid-playstation structures. All offsets exclude the report ID, as WebHID does.
export function familyFor(vendor: number, product: number): Family | null {
  if (vendor !== 0x054c) return null;
  if ([0x05c4, 0x09cc].includes(product)) return 'ds4';
  if ([0x0ce6, 0x0df2].includes(product)) return 'dualsense';
  return null;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bluetoothChecksum(seed: number, id: number, data: DataView): number {
  const bytes = new Uint8Array(data.byteLength - 4 + 2);
  bytes[0] = seed;
  bytes[1] = id;
  bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength - 4), 2);
  return crc32(bytes);
}

function contactAt(data: DataView, offset: number): Contact {
  const id = data.getUint8(offset);
  return { active: !(id & 0x80), id: id & 0x7f, x: data.getUint8(offset + 1) | (data.getUint8(offset + 2) & 0x0f) << 8, y: (data.getUint8(offset + 2) >> 4) | data.getUint8(offset + 3) << 4 };
}

function buttonsAt(data: DataView, offset: number, l2: number, r2: number, hasMute: boolean): number[] {
  const a = data.getUint8(offset), b = data.getUint8(offset + 1), c = data.getUint8(offset + 2);
  const hat = a & 0x0f;
  const flag = (byte: number, mask: number) => Number(Boolean(byte & mask));
  const buttons = [flag(a, 0x20), flag(a, 0x40), flag(a, 0x10), flag(a, 0x80), flag(b, 1), flag(b, 2), l2, r2, flag(b, 16), flag(b, 32), flag(b, 64), flag(b, 128), Number([0, 1, 7].includes(hat)), Number([3, 4, 5].includes(hat)), Number([5, 6, 7].includes(hat)), Number([1, 2, 3].includes(hat)), flag(c, 1), flag(c, 2)];
  if (hasMute) buttons.push(flag(c, 4));
  return buttons;
}

export interface ParsedReport { state: ControllerState; transport: Transport }
export function parseReport(family: Family, id: number, data: DataView, timestamp: number): ParsedReport | null {
  const ds4 = family === 'ds4';
  const bluetooth = id === (ds4 ? 0x11 : 0x31);
  const fullUsb = id === 1 && data.byteLength === 63;
  const minimal = id === 1 && data.byteLength === 9;
  if (!fullUsb && !minimal && !(bluetooth && data.byteLength === 77)) return null;
  if (bluetooth && bluetoothChecksum(0xa1, id, data) !== data.getUint32(data.byteLength - 4, true)) return null;
  const base = bluetooth ? (ds4 ? 2 : 1) : 0;
  const triggerOffset = (ds4 || minimal) ? 7 : 4;
  const l2 = data.getUint8(base + triggerOffset) / 255;
  const r2 = data.getUint8(base + triggerOffset + 1) / 255;
  const state = emptyState();
  state.timestamp = timestamp;
  state.axes = [0, 1, 2, 3].map(i => data.getUint8(base + i) / 127.5 - 1) as ControllerState['axes'];
  state.buttons = buttonsAt(data, base + (ds4 || minimal ? 4 : 7), l2, r2, !ds4 && !minimal);
  if (minimal) return { state, transport: 'bluetooth' };
  const gyroOffset = base + (ds4 ? 12 : 15);
  state.gyro = [0, 2, 4].map(i => data.getInt16(gyroOffset + i, true)) as Vector3;
  state.accel = [0, 2, 4].map(i => data.getInt16(gyroOffset + 6 + i, true)) as Vector3;
  if (ds4) {
    const count = Math.min(data.getUint8(base + 32), bluetooth ? 4 : 3);
    const touchOffset = base + 34 + Math.max(0, count - 1) * 9;
    state.touches = count > 0 ? [contactAt(data, touchOffset), contactAt(data, touchOffset + 4)] : [];
    const status = data.getUint8(base + 29);
    const level = status & 15;
    const plugged = Boolean(status & 0x10);
    state.charging = plugged && level <= 10;
    state.battery = level < 10 ? level * 10 + 5 : level === 10 || plugged && level === 11 ? 100 : null;
  } else {
    state.touchSize = [1920, 1080];
    state.touches = [contactAt(data, base + 32), contactAt(data, base + 36)];
    const status = data.getUint8(base + 52);
    const chargingState = status >> 4;
    state.charging = chargingState === 1;
    state.battery = chargingState === 2 ? 100 : chargingState < 2 && (status & 15) <= 10 ? Math.min(100, (status & 15) * 10 + 5) : null;
  }
  return { state, transport: bluetooth ? 'bluetooth' : 'usb' };
}

export interface OutputCommand { color?: [number, number, number]; motors?: [number, number] }
export function buildOutput(family: Family, transport: Transport, command: OutputCommand, sequence = 0): { id: number; data: Uint8Array } {
  const ds4 = family === 'ds4', bt = transport === 'bluetooth';
  const id = ds4 ? (bt ? 0x11 : 5) : (bt ? 0x31 : 2);
  const data = new Uint8Array(bt ? 77 : ds4 ? 31 : 62);
  const base = bt ? 2 : 0;
  if (bt) {
    data[0] = ds4 ? 0xc4 : (sequence & 15) << 4;
    data[1] = ds4 ? 0 : 0x10;
  }
  const byte = (value: number) => Math.round(Math.max(0, Math.min(255, value)));
  if (command.motors) {
    data[base] |= ds4 ? 1 : 3;
    data[base + (ds4 ? 3 : 2)] = byte(command.motors[1] * 255);
    data[base + (ds4 ? 4 : 3)] = byte(command.motors[0] * 255);
  }
  if (command.color) {
    data[base + (ds4 ? 0 : 1)] |= ds4 ? 2 : 4;
    if (!ds4) {
      data[base + 38] = 2;
      data[base + 41] = 2;
    }
    command.color.forEach((value, i) => { data[base + (ds4 ? 5 : 44) + i] = byte(value); });
  }
  if (bt) new DataView(data.buffer).setUint32(data.byteLength - 4, bluetoothChecksum(0xa2, id, new DataView(data.buffer)), true);
  return { id, data };
}

export interface SensorCalibration { gyroScale: Vector3; accelScale: Vector3; accelBias: Vector3; factory: boolean }
export function nominalCalibration(): SensorCalibration {
  return { gyroScale: [1 / 16.4, 1 / 16.4, 1 / 16.4], accelScale: [1 / 8192, 1 / 8192, 1 / 8192], accelBias: [0, 0, 0], factory: false };
}

export function parseSensorCalibration(data: DataView, family: Family, transport: Transport): SensorCalibration | null {
  // receiveFeatureReport includes the report ID byte, unlike inputreport.
  const expectedId = family === 'ds4' && transport === 'usb' ? 2 : 5;
  if (data.byteLength < 35 || data.getUint8(0) !== expectedId) return null;
  const read = (offset: number) => data.getInt16(offset, true);
  const calibration = nominalCalibration();
  const speed = read(19) + read(21);
  if (speed <= 0) return null;
  for (let axis = 0; axis < 3; axis++) {
    const paired = family === 'dualsense' || transport === 'usb';
    const plus = read(paired ? 7 + axis * 4 : 7 + axis * 2);
    const minus = read(paired ? 9 + axis * 4 : 13 + axis * 2);
    const bias = read(1 + axis * 2);
    const range = Math.abs(plus - bias) + Math.abs(minus - bias);
    const accelPlus = read(23 + axis * 4), accelMinus = read(25 + axis * 4);
    if (range < 100 || accelPlus - accelMinus < 100) return null;
    calibration.gyroScale[axis] = speed / range;
    calibration.accelScale[axis] = 2 / (accelPlus - accelMinus);
    calibration.accelBias[axis] = (accelPlus + accelMinus) / 2;
    if (calibration.gyroScale[axis] < .01 || calibration.gyroScale[axis] > 1 || calibration.accelScale[axis] > .01) return null;
  }
  calibration.factory = true;
  return calibration;
}
