import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RangeWeapon } from '../src/game/weapon.ts';
import { loadModel } from './helpers/assets.ts';

async function setup() {
  const [compact, carbine, longshot] = await Promise.all(['blaster-a', 'blaster-p', 'blaster-e'].map(loadModel));
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 80);
  camera.position.set(0, 3, 9); camera.updateMatrixWorld();
  const weapon = new RangeWeapon({ compact, carbine, longshot }, camera);
  return { camera, weapon };
}

test('each real blaster aims its actual -Z barrel at the joystick reticle and exposes one selected model', async () => {
  const { camera, weapon } = await setup();
  const cursor = new THREE.Vector2(.4, .25), identity = new THREE.Quaternion();
  const ray = new THREE.Raycaster(); ray.setFromCamera(cursor, camera);
  const target = ray.ray.at(15, new THREE.Vector3());
  for (const id of ['compact', 'carbine', 'longshot'] as const) {
    weapon.select(id);
    for (let frame = 0; frame < 120; frame++) weapon.update(cursor, identity, false, true, 1 / 60);
    const barrel = new THREE.Vector3(0, 0, -1).transformDirection(weapon.group.matrixWorld);
    const origin = weapon.group.getWorldPosition(new THREE.Vector3());
    const distance = (target.z - origin.z) / barrel.z;
    assert.ok(origin.addScaledVector(barrel, distance).distanceTo(target) < 1e-7);
    assert.equal(weapon.group.children.filter(object => object instanceof THREE.Group && object.visible).length, 1);
    const muzzle = weapon.fire();
    assert.ok(Number.isFinite(muzzle.x + muzzle.y + muzzle.z));
    assert.ok(muzzle.z < weapon.group.getWorldPosition(new THREE.Vector3()).z, 'muzzle must be ahead of the player');
  }
});

test('gyro gun retains grip roll and actual offscreen direction', async () => {
  const { weapon } = await setup();
  const gunPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, 1.1, .6));
  for (let frame = 0; frame < 120; frame++) weapon.update(new THREE.Vector2(.96, .96), gunPose, true, false, 1 / 60);
  assert.ok(weapon.group.quaternion.angleTo(gunPose) < 1e-7);
});

test('repeated recoil settles back to aim without accumulating rotation and muzzle flashes expire', async () => {
  const { weapon } = await setup();
  const cursor = new THREE.Vector2(), identity = new THREE.Quaternion();
  for (let frame = 0; frame < 120; frame++) weapon.update(cursor, identity, false, true, 1 / 60);
  const resting = weapon.group.quaternion.clone();
  const muzzle = weapon.group.children.find(object => object instanceof THREE.Mesh)!;
  for (let shot = 0; shot < 20; shot++) {
    weapon.fire(); weapon.update(cursor, identity, false, true, .01);
    assert.equal(muzzle.visible, true);
    assert.ok(weapon.group.quaternion.angleTo(resting) > .02);
    for (let frame = 0; frame < 60; frame++) weapon.update(cursor, identity, false, true, 1 / 60);
    assert.equal(muzzle.visible, false);
    assert.ok(weapon.group.quaternion.angleTo(resting) < 1e-7);
  }
});
