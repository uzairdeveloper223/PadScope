import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { RangeAim, defaultRangeSettings, restoreRangeSettings, validRangeSettings } from '../src/game/aim.ts';
import { ButtonEdges } from '../src/game/input.ts';
import { RangeRound } from '../src/game/round.ts';
import type { Rotation, Vector3 as SensorVector } from '../src/controller/state.ts';

const pose = (q: Quaternion): Rotation => q.toArray() as Rotation;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} must equal ${b}`);

test('gyro grip uses the left handle as forward and gravity as screen-up at different grip rolls', () => {
  for (const roll of [0, .4, Math.PI / 2, Math.PI, -1.3]) {
    const aim = new RangeAim();
    const up = new Vector3(0, Math.cos(roll), Math.sin(roll));
    const accel: SensorVector = [up.x, up.z, -up.y];
    const neutral = new Quaternion().setFromAxisAngle(new Vector3(.3, .8, -.2).normalize(), 1.2);
    assert.equal(aim.captureGrip(pose(neutral), accel), true);
    aim.updateGyro(pose(neutral), defaultRangeSettings(), 16 / 9, 42);
    close(aim.cursor.length(), 0);
    close(new Vector3(-1, 0, 0).applyQuaternion(aim.weapon).distanceTo(new Vector3(0, 0, -1)), 0);
    assert.equal(aim.inside, true);

    const yaw = .12;
    const turn = neutral.clone().multiply(new Quaternion().setFromAxisAngle(up, -yaw));
    aim.updateGyro(pose(turn), defaultRangeSettings(), 16 / 9, 42);
    assert.ok(new Vector3(0, 0, -1).applyQuaternion(aim.gunPose).distanceTo(new Vector3(-1, 0, 0).applyQuaternion(aim.weapon)) < 1e-8);
    close(aim.cursor.x, Math.tan(yaw) / Math.tan(21 * Math.PI / 180) / (16 / 9));
    close(aim.cursor.y, 0);
    const right = new Vector3(-1, 0, 0).cross(up).normalize();
    const pitch = neutral.clone().multiply(new Quaternion().setFromAxisAngle(right, .08));
    aim.updateGyro(pose(pitch), defaultRangeSettings(), 16 / 9, 42);
    close(aim.cursor.y, Math.tan(.08) / Math.tan(21 * Math.PI / 180));
    close(aim.cursor.x, 0);
  }
});

test('gyro aiming can be recentered, inverted, and cannot shoot while pointing offscreen or backwards', () => {
  const aim = new RangeAim();
  const settings = defaultRangeSettings();
  aim.updateGyro([0, 0, 0, 1], settings, 1.5, 42);
  assert.equal(aim.inside, false);
  assert.equal(aim.captureGrip([0, 0, 0, 1], [0, 0, -1]), true);
  const right = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -.1);
  aim.updateGyro(pose(right), settings, 1.5, 42);
  const x = aim.cursor.x;
  aim.updateGyro(pose(right), { ...settings, invertX: true, sensitivity: 2 }, 1.5, 42);
  close(aim.cursor.x, -x * 2);
  const backwards = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
  aim.updateGyro(pose(backwards), settings, 1.5, 42);
  assert.equal(aim.inside, false);
  const edge = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -.9);
  aim.updateGyro(pose(edge), settings, 1.5, 42);
  assert.equal(aim.inside, false);
  assert.ok(Math.abs(aim.cursor.x) <= .96);
  assert.equal(aim.captureGrip(pose(right), [0, 0, -1]), true);
  aim.updateGyro(pose(right), settings, 1.5, 42);
  close(aim.cursor.length(), 0);
  aim.clearGrip(); assert.equal(aim.centered, false);
});

test('grip calibration rejects moving, missing, or vertically pointing grip samples', () => {
  const aim = new RangeAim();
  assert.equal(aim.captureGrip([0, 0, 0, 1], [0, 0, 0]), false);
  assert.equal(aim.captureGrip([0, 0, 0, 1], [0, 0, -2]), false);
  assert.equal(aim.captureGrip([0, 0, 0, 1], [1, 0, 0]), false);
  assert.equal(aim.captureGrip([0, 0, NaN, 1], [0, 0, -1]), false);
  assert.equal(aim.captureGrip([0, 0, 0, 1], [0, NaN, -1]), false);
  assert.equal(aim.centered, false);
});

test('stick aim is frame-rate independent, uses the selected stick, and honors inversion', () => {
  const fast = new RangeAim(), slow = new RangeAim();
  const settings = { ...defaultRangeSettings(), stick: 'left' as const };
  for (let i = 0; i < 120; i++) fast.updateStick([.4, -.3, 1, 1], 1 / 120, settings, 2);
  for (let i = 0; i < 10; i++) slow.updateStick([.4, -.3, 1, 1], .1, settings, 2);
  close(fast.cursor.x, slow.cursor.x); close(fast.cursor.y, slow.cursor.y);
  close(fast.cursor.x, .4 ** 2 * 2.4 / 2); close(fast.cursor.y, .3 ** 2 * 2.4);
  slow.centerStick(); slow.updateStick([.4, -.3, 0, 0], 1, { ...settings, invertX: true, invertY: true }, 2);
  close(slow.cursor.x, -fast.cursor.x); close(slow.cursor.y, -fast.cursor.y);
  slow.updateStick([1, 1, 0, 0], 10, settings, 1);
  assert.ok(Math.abs(slow.cursor.x) <= .96 && Math.abs(slow.cursor.y) <= .96);
});

test('a held or noisy trigger fires once until released, including across pause and remapping', () => {
  const edges = new ButtonEdges();
  const report = (r2: number) => [0, 0, 0, 0, 0, 0, 0, r2];
  edges.seed(report(1));
  assert.deepEqual(edges.update(report(1)), []);
  assert.deepEqual(edges.update(report(.3)), []);
  assert.deepEqual(edges.update(report(.6)), []);
  assert.deepEqual(edges.update(report(.2)), []);
  assert.deepEqual(edges.update(report(.54)), []);
  assert.deepEqual(edges.update(report(.56)), [7]);
  assert.deepEqual(edges.update(report(.4)), []);
  assert.deepEqual(edges.update(report(.8)), []);
  edges.seed(report(.8));
  assert.deepEqual(edges.update(report(.8)), []);
  edges.update(report(0));
  assert.deepEqual(edges.update(report(1)), [7]);
});

test('round time and scoring stop during pause and after exactly sixty seconds', () => {
  const round = new RangeRound();
  round.shoot(true); assert.equal(round.shots, 0);
  round.start(); round.advance(20); round.shoot(true); round.pause();
  round.advance(40); round.shoot(false);
  assert.equal(round.remaining, 40); assert.equal(round.shots, 1); assert.equal(round.score, 100);
  round.resume(); assert.equal(round.shoot(true, true, true), 210);
  assert.equal(round.accuracy, 100); assert.equal(round.bestStreak, 2);
  round.shoot(false); assert.equal(round.accuracy, 67); assert.equal(round.streak, 0);
  round.advance(NaN); round.advance(-1); assert.equal(round.remaining, 40);
  round.advance(39.99); assert.equal(round.status, 'running');
  round.advance(.02); assert.equal(round.status, 'finished'); assert.equal(round.remaining, 0);
  round.shoot(true); assert.equal(round.shots, 3);
  round.start(); assert.equal(round.score, 0); assert.equal(round.shots, 0); assert.equal(round.bestStreak, 0);
});

test('corrupt range settings and duplicate or out-of-range controls are rejected', () => {
  const defaults = defaultRangeSettings();
  assert.equal(validRangeSettings(defaults), true);
  for (const value of [null, {}, { ...defaults, fire: 64 }, { ...defaults, recenter: 7 }, { ...defaults, sensitivity: Infinity }, { ...defaults, invertY: 'yes' }, { ...defaults, mode: 'fake' }]) assert.equal(validRangeSettings(value), false);
  assert.equal(validRangeSettings({ ...defaults, weapon: 'unknown' }), false);
  const { weapon: _weapon, ...old } = { ...defaults, fire: 5, pause: 10, sensitivity: 1.5 };
  assert.deepEqual(restoreRangeSettings({ ...old, version: 1 }), { ...old, version: 2, weapon: 'compact' });
});
