import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 as SpatialVector } from 'three';
import { MotionTracker } from '../src/controller/calibration.ts';
import type { Rotation, Vector3 } from '../src/controller/state.ts';

const zero: Vector3 = [0, 0, 0];
const front: Vector3 = [0, 0, -1];
const angleBetween = (a: Rotation, b: Rotation) => new Quaternion(...a).angleTo(new Quaternion(...b));

test('resting gyro offsets and acceleration noise do not accumulate model rotation', () => {
  for (const acceleration of [front, [0, 1, 0], [.12, .99, .39]] as Vector3[]) {
    const motion = new MotionTracker();
    let settled: Rotation = [0, 0, 0, 1];
    let result = settled;
    for (let sample = 0; sample <= 15000; sample++) {
      const noise = Math.sin(sample * .7);
      result = motion.update([1.8 + noise * .04, .5 - noise * .02, .35 + noise * .03],
        acceleration.map(value => value + noise * .001) as Vector3, sample * 4, zero);
      if (sample === 500) settled = result;
    }
    assert.equal(motion.stationary, true);
    assert.ok(angleBetween(settled, result) < 1e-7, '60 seconds of resting reports must hold the same pose');
  }
});

test('intentional slow turns resume immediately after rest, with the correct axis and direction', () => {
  const motion = new MotionTracker();
  const bias: Vector3 = [0, 0, .35];
  let before: Rotation = [0, 0, 0, 1];
  for (let sample = 0; sample <= 250; sample++) before = motion.update(bias, front, sample * 4, zero);
  assert.equal(motion.stationary, true);
  let result = motion.update([0, 0, 1.35], front, 1004, zero);
  assert.equal(motion.stationary, false);
  for (let sample = 2; sample <= 250; sample++) result = motion.update([0, 0, 1.35], front, 1000 + sample * 4, zero);
  const expected = new Quaternion(...before).multiply(new Quaternion().setFromAxisAngle(new SpatialVector(0, -1, 0), Math.PI / 180));
  assert.ok(new Quaternion(...result).angleTo(expected) < 1e-6, 'one second at 1°/s must turn 1° about negative model Y');
});

test('turning after rest preserves the sensor-to-model basis for all three axes', () => {
  const axes = [new SpatialVector(1, 0, 0), new SpatialVector(0, 0, 1), new SpatialVector(0, -1, 0)];
  axes.forEach((axis, index) => {
    const motion = new MotionTracker();
    for (let sample = 0; sample <= 250; sample++) motion.update(zero, front, sample * 4, zero);
    const gyro: Vector3 = [0, 0, 0];
    gyro[index] = 60;
    let pose: Rotation = [0, 0, 0, 1];
    for (let sample = 1; sample <= 125; sample++) pose = motion.update(gyro, front, 1000 + sample * 4, zero);
    const expected = new Quaternion().setFromAxisAngle(axis, Math.PI / 6);
    assert.ok(new Quaternion(...pose).angleTo(expected) < 1e-6);
    assert.equal(motion.stationary, false);
  });
});

test('acceleration changes release the rest lock even when gyro rates are small', () => {
  const motion = new MotionTracker();
  for (let sample = 0; sample <= 250; sample++) motion.update(zero, front, sample * 4, zero);
  assert.equal(motion.stationary, true);
  motion.update(zero, [.1, 0, -Math.sqrt(.99)], 1004, zero);
  assert.equal(motion.stationary, false);
});

test('missing reports, repeated timestamps, and invalid sensor data cannot rotate the model', () => {
  const motion = new MotionTracker();
  motion.update(zero, front, 0, zero);
  const pose = motion.update([0, 0, 20], front, 4, zero);
  assert.deepEqual(motion.update([0, 0, 20], front, 4, zero), pose);
  assert.deepEqual(motion.update([0, 0, 20], front, 3, zero), pose);
  assert.deepEqual(motion.update([0, 0, 20], front, 5000, zero), pose);
  assert.deepEqual(motion.update([NaN, 0, 0], front, 5004, zero), pose);
  const resumed = motion.update([0, 0, 20], front, 5004, zero);
  assert.ok(angleBetween(pose, resumed) > .001);
});

test('recenter discards learned offsets when a new manual gyro bias is applied', () => {
  const motion = new MotionTracker();
  const bias: Vector3 = [0, 0, 2];
  for (let sample = 0; sample <= 250; sample++) motion.update(bias, front, sample * 4, zero);
  assert.equal(motion.stationary, true);
  motion.recenter();
  let pose: Rotation = [0, 0, 0, 1];
  for (let sample = 1; sample <= 250; sample++) pose = motion.update(bias, front, 1000 + sample * 4, bias);
  assert.ok(angleBetween(pose, [0, 0, 0, 1]) < 1e-7, 'manual bias must not be subtracted a second time');
  assert.equal(motion.stationary, true);
  motion.reset();
  assert.equal(motion.stationary, false);
  assert.deepEqual(motion.update(zero, front, 0, zero), [0, 0, 0, 1]);
});
