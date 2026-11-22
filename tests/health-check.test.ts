import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings } from '../src/controller/calibration.ts';
import type { Axes } from '../src/controller/state.ts';
import { measureRest, StickSweep, TriggerTravel } from '../src/health/measurements.ts';
import { HealthSession, comparableReports } from '../src/health/session.ts';
import type { HealthDevice, HealthInput, HealthReport } from '../src/health/session.ts';
import { isHealthReport, readHistory, reportText, writeHistory } from '../src/health/reports.ts';
import { comparisonText, measurementTables, suggestedDeadzone, sweepPath } from '../src/health/presentation.ts';
import { RecordedConnection } from '../src/health/connection.ts';

const device: HealthDevice = { source: 'hid:test:1', key: 'hid:54c:9cc', name: 'PS5 Controller', api: 'hid', mapping: 'sony-hid', connection: 'usb', axes: 4, buttons: 18 };
const input = (axes: Axes = [0, 0, 0, 0], buttons = Array(18).fill(0)): HealthInput => ({ device, axes, buttons, active: true, preview: false, timestamp: 1 });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} must equal ${b}`);
const clone = (report: HealthReport): HealthReport => JSON.parse(JSON.stringify(report));
function warmup(session: HealthSession): void {
  session.update(0, input()); session.update(20, input([.8, -.8, -.8, .8])); session.update(40, input());
  assert.equal(session.next(), true);
}
function rest(session: HealthSession, axes: Axes = [.03, .04, 0, .02]): void {
  for (let time = 100; time <= 5100; time += 20) session.update(time, input(axes));
  assert.equal(session.restComplete, true);
}

test('hands-off statistics separate a resting offset, jitter, and the calibrated suggestion', () => {
  const readings = Array.from({ length: 100 }, (_, i) => ({ axes: [i < 96 ? .03 : .3, i < 96 ? .04 : .4, 0, 0] as Axes, triggers: [0, 0] }));
  const result = measureRest(readings, 0, [0, 0, 0, 0], true, true)!;
  close(result.p95, .05); close(result.peak, .5); close(result.meanRadius, .068); close(result.outsideReference, .04);
  assert.ok(result.jitter > .08); assert.equal(result.stable, false); assert.equal(result.suggestedDeadzone, null);
  const centered = measureRest(readings.slice(0, 96), 0, [.03, .04, 0, 0], true, true)!;
  close(centered.p95, .05); close(centered.centeredP95, 0); close(centered.suggestedDeadzone!, .01);
  assert.equal(measureRest(readings.slice(0, 96), 0, [0, 0, 0, 0], true, true)!.suggestedDeadzone, .06);
  assert.equal(measureRest(readings.slice(0, 96), 0, [0, 0, 0, 0], false, true)!.suggestedDeadzone, null);
  assert.equal(measureRest(readings.slice(0, 96), 0, [0, 0, 0, 0], true, false)!.suggestedDeadzone, null);
  assert.equal(measureRest([], 0, [0, 0, 0, 0], true, true), null);
});

test('warm-up rejects unchanging held axes and verifies real motion followed by release', () => {
  const session = new HealthSession(device, defaultSettings());
  for (let time = 0; time < 200; time += 20) session.update(time, input([.8, .8, .8, .8]));
  assert.equal(session.ready, false); assert.equal(session.next(), false);
  session.update(200, input()); assert.equal(session.ready, true); assert.equal(session.next(), true);
  rest(session); const report = session.report();
  assert.equal(report.rest[0]?.verified, true); assert.equal(report.rest[1]?.verified, true);
  assert.equal(suggestedDeadzone(report), .06);
});

test('hands-off capture restarts after a gap but retains a completed window across pause', () => {
  const session = new HealthSession(device, defaultSettings()); warmup(session);
  session.update(100, input()); session.update(120, input()); session.update(500, input());
  assert.equal(session.status, 'paused'); assert.equal(session.restProgress, 0); assert.equal(session.report().rest[0], null);
  assert.equal(session.resume({ ...device, source: 'another' }), false);
  assert.equal(session.resume(device), true); rest(session);
  const measured = session.report().rest;
  session.pause('Focus lost'); assert.deepEqual(session.report().rest, measured);
  assert.equal(session.report().interruptions.length, 2);
});

test('finishing early retains partial evidence and switching sources cannot mix measurements', () => {
  for (const ending of ['stop', 'source', 'preview']) {
    const session = new HealthSession(device, defaultSettings()); warmup(session);
    session.update(100, input([.1, 0, 0, 0])); session.update(120, input([.1, 0, 0, 0]));
    if (ending === 'stop') session.stop();
    else session.update(140, { ...input([1, 1, 1, 1]), preview: ending === 'preview', device: ending === 'source' ? { ...device, source: 'another' } : device });
    assert.equal(session.status, 'finished'); assert.equal(session.report().rest[0]?.complete, false);
    assert.equal(session.report().rest[0]?.samples, 2); close(session.report().rest[0]!.mean[0], .1);
    assert.equal(suggestedDeadzone(session.report()), null);
  }
});

test('sweep coverage requires every outer sector and preserves square-shaped output without a fault label', () => {
  const circle = new StickSweep(), square = new StickSweep();
  circle.add(0, 0); circle.add(.2, .2); assert.equal(circle.result().covered, 0);
  for (let sector = 0; sector < 24; sector++) {
    const angle = (sector + .5) / 24 * Math.PI * 2, x = Math.cos(angle), y = Math.sin(angle);
    circle.add(x, y); square.add(x / Math.max(Math.abs(x), Math.abs(y)), y / Math.max(Math.abs(x), Math.abs(y)));
    if (sector < 23) assert.equal(circle.result().complete, false);
  }
  assert.equal(circle.result().complete, true); close(circle.result().circularityError!, 0);
  assert.ok(square.result().circularityError! > 10); assert.ok(square.result().maxRadius! > 1);
  assert.equal(sweepPath(circle.result().sectors).match(/M/g)?.length, 24);
});

test('trigger travel requires a released-full-released cycle and breaks continuity across pause', () => {
  const trigger = new TriggerTravel();
  trigger.add(1); trigger.add(0); assert.equal(trigger.result(0).cycles, 0);
  trigger.add(.4); trigger.add(.6); trigger.add(.97); trigger.add(.96); trigger.add(.8); trigger.add(.04);
  assert.equal(trigger.result(0).cycles, 1); assert.equal(trigger.result(0).intermediate, true);
  trigger.add(1); trigger.breakContinuity(); trigger.add(0); assert.equal(trigger.result(0).cycles, 1);
  const stopped = new TriggerTravel(); [0, .3, .6, 0].forEach(value => stopped.add(value));
  assert.equal(stopped.result(0).complete, false); assert.equal(stopped.result(0).max, .6);
});

test('held buttons and cross-pause releases do not manufacture observed button cycles', () => {
  const session = new HealthSession(device, defaultSettings());
  for (let i = 0; i < 4; i++) session.next(true);
  const buttons = Array(18).fill(0); buttons[0] = 1;
  session.update(0, input(undefined, buttons)); session.update(20, input());
  assert.equal(session.report().buttons[0].presses, 0); assert.equal(session.report().buttons[0].releases, 0);
  session.update(40, input(undefined, buttons)); session.pause(); session.resume(device);
  session.update(60, input(undefined, buttons)); session.update(80, input());
  assert.equal(session.report().buttons[0].presses, 1); assert.equal(session.report().buttons[0].releases, 0);
  session.update(100, input(undefined, buttons)); session.update(120, input());
  assert.equal(session.report().buttons[0].presses, 2); assert.equal(session.report().buttons[0].releases, 1);
  session.excludeButton(16, true); assert.equal(session.report().buttons[16].excluded, true);
});

test('unmapped devices keep index labels and never infer absent sticks or analog trigger positions', () => {
  const unmapped = { ...device, api: 'gamepad' as const, mapping: 'unmapped' as const, axes: 2, buttons: 10 };
  const session = new HealthSession(unmapped, defaultSettings());
  assert.deepEqual(session.supportedSticks, [true, false]); assert.deepEqual(session.supportedTriggers, [false, false]);
  session.next(true); session.next(true); session.next(true);
  assert.equal(session.ready, true); assert.deepEqual(session.report().triggers, [null, null]);
  assert.equal(session.report().rest[1], null); assert.equal(session.report().buttons[6].label, 'Button 6');
  assert.match(measurementTables(session.report()), /Axes 0\/1/);
});

test('report snapshots preserve calibration and comparison rejects changed source conditions', () => {
  const settings = defaultSettings(), session = new HealthSession(device, settings);
  warmup(session); rest(session); const a = session.report('browser', 'USB, factory profile');
  settings.centers[0] = .1; settings.deadzone = .2;
  assert.deepEqual(a.calibration, defaultSettings()); assert.deepEqual(session.report().calibration, defaultSettings());
  assert.equal(isHealthReport(a), true);
  const b = clone(a); b.createdAt = '2026-11-22T01:00:00.000Z'; b.rest[0]!.p95 = .04;
  assert.equal(comparableReports(a, b), true); assert.match(comparisonText(a, b), /\+1\.0 percentage points/);
  for (const change of [() => b.device.api = 'gamepad', () => b.device.connection = 'bluetooth', () => b.device.connection = 'not recorded', () => b.device.mapping = 'unmapped', () => b.browser = 'another browser', () => b.calibration.centers[0] = .1]) {
    const before = clone(b); change(); assert.equal(comparableReports(a, b), false); Object.assign(b, before);
  }
});

test('a complete live-input flow records every required step and can be saved without losing evidence', () => {
  const session = new HealthSession(device, defaultSettings()); warmup(session); rest(session);
  assert.equal(session.next(), true);
  let time = 5200;
  for (let sector = 0; sector < 24; sector++) {
    const angle = (sector + .5) / 24 * Math.PI * 2;
    session.update(time, input([Math.cos(angle), Math.sin(angle), Math.cos(angle), Math.sin(angle)])); time += 20;
  }
  assert.equal(session.next(), true);
  for (const value of [0, .4, 1, 0]) { const buttons = Array(18).fill(0); buttons[6] = value; buttons[7] = value; session.update(time, input(undefined, buttons)); time += 20; }
  assert.equal(session.next(), true);
  session.update(time, input()); time += 20;
  for (let index = 0; index < 18; index++) {
    const buttons = Array(18).fill(0); buttons[index] = 1;
    session.update(time, input(undefined, buttons)); session.update(time + 20, input()); time += 40;
  }
  assert.equal(session.next(), true); assert.equal(session.status, 'finished');
  const report = session.report('browser', 'USB, factory profile');
  assert.deepEqual(report.stepsFinished, ['prepare', 'rest', 'sweep', 'triggers', 'buttons']);
  assert.equal(isHealthReport(report), true); assert.deepEqual(report, clone(report));
  assert.equal(report.buttons.every(button => button.presses === 1 && button.releases === 1), true);
  assert.equal(report.sweep.every(sweep => sweep.complete), true); assert.equal(report.triggers.every(trigger => trigger?.cycles === 1), true);
  assert.ok(report.sampling.observations > 250); // Stationary timestamps did not suppress the timed observations.
  assert.equal(report.sampling.sourceUpdates, 1);
});

test('report presentation escapes user content and rejects corrupt saved measurements', () => {
  const session = new HealthSession(device, defaultSettings()), report = session.report('browser', '<script>notes</script>');
  report.device.name = '<img src=x onerror=alert(1)>'; report.buttons[0].label = '<svg/onload=alert(1)>';
  assert.equal(isHealthReport(report), true); assert.ok(!measurementTables(report).includes('<img'));
  assert.match(reportText(report), /<script>notes<\/script>/); // Plain text, never executable HTML.
  for (const value of [null, {}, { ...report, schemaVersion: 2 }, { ...report, device: { ...device, buttons: 200 } }, { ...report, sweep: [{ ...report.sweep[0], maxRadius: Infinity }, report.sweep[1]] }, { ...report, rest: [{ p95: .1 }, null] }]) assert.equal(isHealthReport(value), false);
});

test('saved history is bounded, validates entries, and handles unavailable browser storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); let value: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } } });
  try {
    const report = new HealthSession(device, defaultSettings()).report();
    assert.equal(writeHistory(Array(11).fill(report)), true); assert.equal(readHistory().length, 10);
    value = JSON.stringify([null, { ...report, schemaVersion: 2 }, report]); assert.equal(readHistory().length, 1);
    value = 'broken JSON'; assert.deepEqual(readHistory(), []);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Unavailable'); } });
    assert.equal(writeHistory([report]), false); assert.deepEqual(readHistory(), []);
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('a recorded Gamepad transport belongs to that source and cannot carry into another controller report', () => {
  const recorded = new RecordedConnection();
  const a: HealthDevice = { ...device, api: 'gamepad', mapping: 'standard', source: 'gamepad:a:0', key: 'gamepad:a', connection: 'not recorded' };
  const b: HealthDevice = { ...a, source: 'gamepad:b:1', key: 'gamepad:b' };
  assert.equal(recorded.forDevice(a)!.connection, 'not recorded');
  recorded.remember(a, 'usb');
  const first = new HealthSession(recorded.forDevice(a)!, defaultSettings()); first.stop();
  assert.equal(first.report().device.connection, 'usb');
  assert.equal(new HealthSession(recorded.forDevice(a)!, defaultSettings()).report().device.connection, 'usb');
  const second = new HealthSession(recorded.forDevice(b)!, defaultSettings()); second.stop();
  assert.equal(second.report().device.connection, 'not recorded');
  assert.equal(isHealthReport(second.report()), true);
  recorded.remember(b, 'bluetooth');
  assert.equal(recorded.forDevice(b)!.connection, 'bluetooth');
  assert.equal(recorded.forDevice(device)!.connection, 'usb'); // Known HID transport is independent.
  assert.equal(recorded.forDevice(b)!.connection, 'bluetooth');
  assert.equal(first.report().device.connection, 'usb'); // Prior report evidence stays intact.
});
