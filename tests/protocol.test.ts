import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutput, crc32, parseReport } from '../src/controller/protocol.ts';

// Actual USB report captured from the user's Sony 054c:09cc controller.
// Includes its report ID; inputreport's DataView excludes that first byte.
const captured = '01808080800800780000fa4d001b0008000600fcfb9b20590c000000000019000001008000000080000000008000000080000000008000000080000000008000';
const usb = () => Uint8Array.from(Buffer.from(captured, 'hex')).slice(1);
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

test('real DS4 USB report decodes motion, released controls, battery, and inactive contacts at WebHID offsets', () => {
  const bytes = usb(), report = parseReport('ds4', 1, view(bytes), 123)!;
  assert.ok(report); assert.equal(report.transport, 'usb');
  assert.equal(report.state.timestamp, 123);
  assert.deepEqual(report.state.gyro, [27, 8, 6]);
  assert.deepEqual(report.state.accel, [-1028, 8347, 3161]);
  assert.equal(report.state.buttons.length, 18);
  assert.ok(report.state.buttons.every(n => n === 0));
  assert.equal(report.state.battery, 95); assert.equal(report.state.charging, true);
  assert.deepEqual(report.state.touches, [{ id: 0, active: false, x: 0, y: 0 }, { id: 0, active: false, x: 0, y: 0 }]);
});

test('DS4 battery intervals, plugged full state, and invalid/error levels remain distinct', () => {
  const bytes = usb();
  for (const plugged of [false, true]) for (let level = 0; level < 16; level++) {
    bytes[29] = level | (plugged ? 0x10 : 0);
    const state = parseReport('ds4', 1, view(bytes), 0)!.state;
    const expected = level <= 9 ? level * 10 + 5 : level === 10 || plugged && level === 11 ? 100 : null;
    assert.equal(state.battery, expected, `level ${level}, plugged ${plugged}`);
    assert.equal(state.charging, plugged && level <= 10);
  }
});

test('DS4 buttons, analog triggers, and newest touch packet are decoded without report-ID offset errors', () => {
  const bytes = usb();
  bytes[4] = 0x21; bytes[5] = 0x21; bytes[6] = 2; bytes[7] = 128; bytes[8] = 255;
  bytes[32] = 2;
  // Latest touch packet starts at 43; X=0x678, Y=0x345, contact id=3.
  bytes.set([3, 0x78, 0x56, 0x34, 0x84, 0, 0, 0], 43);
  const state = parseReport('ds4', 1, view(bytes), 0)!.state;
  for (const button of [0, 4, 7, 9, 12, 15, 17]) assert.equal(state.buttons[button], 1);
  assert.equal(state.buttons[6], 128 / 255);
  assert.deepEqual(state.touches, [{ active: true, id: 3, x: 0x678, y: 0x345 }, { active: false, id: 4, x: 0, y: 0 }]);
});

test('Bluetooth input requires a valid checksum and rejects truncated or unsupported reports', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bytes = new Uint8Array(77); bytes.set(usb(), 2);
  const signed = new Uint8Array(75); signed[0] = 0xa1; signed[1] = 0x11; signed.set(bytes.subarray(0, 73), 2);
  view(bytes).setUint32(73, crc32(signed), true);
  const report = parseReport('ds4', 0x11, view(bytes), 0)!;
  assert.equal(report.transport, 'bluetooth'); assert.deepEqual(report.state.gyro, [27, 8, 6]);
  bytes[14] ^= 1; assert.equal(parseReport('ds4', 0x11, view(bytes), 0), null);
  assert.equal(parseReport('ds4', 1, view(usb().subarray(0, 20)), 0), null);
  assert.equal(parseReport('ds4', 8, view(usb()), 0), null);
});

test('USB output encodes independent rumble and lights; Bluetooth output has its own signed prefix', () => {
  const output = buildOutput('ds4', 'usb', { motors: [1, .5], color: [12, 34, 56] });
  assert.equal(output.id, 5); assert.equal(output.data.length, 31);
  assert.deepEqual(Array.from(output.data.subarray(0, 8)), [3, 0, 0, 128, 255, 12, 34, 56]);
  const bt = buildOutput('ds4', 'bluetooth', { motors: [0, 0] });
  const signed = new Uint8Array(75); signed[0] = 0xa2; signed[1] = 0x11; signed.set(bt.data.subarray(0, 73), 2);
  assert.equal(bt.id, 0x11); assert.equal(view(bt.data).getUint32(73, true), crc32(signed));
});
