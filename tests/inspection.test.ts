import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InspectionPose, inspectionDistance } from '../src/game/inspection-pose.ts';
import { prepareBlaster } from '../src/game/blasters.ts';
import { loadModel } from './helpers/assets.ts';
import type { Rotation } from '../src/controller/state.ts';

const pose = (q: THREE.Quaternion): Rotation => q.toArray() as Rotation;

test('inspection requires grip centering, then follows all physical axes 1:1 even backwards', () => {
  const inspection = new InspectionPose();
  const neutral = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, -.6, .2));
  inspection.update(pose(neutral)); assert.equal(inspection.centered, false);
  assert.equal(inspection.center(pose(neutral), [0, 0, -1]), true);
  assert.ok(inspection.rotation.angleTo(new THREE.Quaternion()) < 1e-7);
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const screenAxes = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)];
  for (let axis = 0; axis < 3; axis++) for (const angle of [.3, 1.4, Math.PI, Math.PI * 1.8]) {
    const turn = new THREE.Quaternion().setFromAxisAngle(axes[axis], angle);
    inspection.update(pose(neutral.clone().multiply(turn)));
    const expected = new THREE.Quaternion().setFromAxisAngle(screenAxes[axis], angle);
    assert.ok(inspection.rotation.angleTo(expected) < 1e-7, `axis ${axis} angle ${angle}`);
  }
});

test('inspection freeze holds a pose, resume catches the live grip, and recenter clears the offset', () => {
  const inspection = new InspectionPose(), neutral = new THREE.Quaternion();
  inspection.toggleFreeze(); assert.equal(inspection.frozen, false);
  inspection.center(pose(neutral), [0, 0, -1]);
  const first = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .5);
  inspection.update(pose(first)); inspection.toggleFreeze();
  const frozen = inspection.rotation.clone();
  const next = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.5);
  inspection.update(pose(next)); assert.ok(inspection.rotation.angleTo(frozen) < 1e-7);
  inspection.toggleFreeze(); inspection.update(pose(next)); assert.ok(inspection.rotation.angleTo(next) < 1e-7);
  inspection.center(pose(next), [0, 0, -1]); assert.ok(inspection.rotation.angleTo(neutral) < 1e-7);
  inspection.clear(); assert.equal(inspection.centered, false); assert.equal(inspection.frozen, false);
  assert.equal(inspection.center(pose(neutral), [1, 0, 0]), false, 'vertical left-handle grip is rejected');
});

test('every real blaster remains framed through arbitrary inspection rotations at all zooms and aspect ratios', async () => {
  for (const name of ['blaster-a', 'blaster-p', 'blaster-e']) {
    const { model, radius } = prepareBlaster(await loadModel(name), 2.6);
    for (const aspect of [.45, .6, 1, 16 / 9, 2.5]) for (const zoom of [.7, 1, 1.6]) {
      const camera = new THREE.PerspectiveCamera(38, aspect, .1, 80);
      camera.position.z = inspectionDistance(radius, aspect, 38, zoom); camera.updateMatrixWorld();
      for (let angle = 0; angle < Math.PI * 2; angle += .35) {
        model.quaternion.setFromEuler(new THREE.Euler(angle * .7, angle, angle * 1.3));
        const bounds = new THREE.Box3().setFromObject(model);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1, `${name}: clipped at ${aspect}, ${zoom}, ${angle}`);
        }
      }
    }
  }
});
