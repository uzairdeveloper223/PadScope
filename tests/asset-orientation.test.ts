import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { prepareBlaster } from '../src/game/blasters.ts';
import { placeCrate } from '../src/game/props.ts';
import { TargetField } from '../src/game/targets.ts';
import { loadModel } from './helpers/assets.ts';

test('muzzle anchors use the source barrel end, not the stock, on every actual blaster', async () => {
  for (const name of ['blaster-a', 'blaster-p', 'blaster-e']) {
    const source = await loadModel(name), original = new THREE.Box3().setFromObject(source);
    const center = original.getCenter(new THREE.Vector3()), scale = 2.6 / (original.max.z - original.min.z);
    const { model, muzzle } = prepareBlaster(source, 2.6);
    assert.ok(muzzle.z < -1.29, `${name}: muzzle must be on the authored -Z barrel end`);
    assert.ok(Math.abs(muzzle.z / scale + center.z - original.min.z) < .008);
    assert.ok(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()).length() < 1e-7);
  }
});

test('target colored -X faces point at the player while +Y stays upright', async () => {
  const [large, small] = await Promise.all(['target-large', 'target-small'].map(loadModel));
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, .1, 80);
  camera.position.set(0, 3, 9); camera.updateMatrixWorld();
  const field = new TargetField(large, small, camera);
  for (const target of field.group.children.slice(0, 5)) {
    const model = target.children[0]; model.updateWorldMatrix(true, true);
    assert.ok(new THREE.Vector3(-1, 0, 0).transformDirection(model.matrixWorld).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-7);
    assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld).y > .999);
  }
});

test('real crates sit on the floor, with lids above their bodies and latches facing the player', async () => {
  for (const name of ['crate-wide', 'crate-medium']) {
    const source = await loadModel(name);
    const crate = placeCrate(source, -6, -4, 4);
    const bounds = new THREE.Box3().setFromObject(crate);
    assert.ok(Math.abs(bounds.min.y) < 1e-7, 'base is grounded after orientation');
    const lid = crate.getObjectByName('lid')!;
    assert.ok(lid, 'artist-authored lid is retained');
    const lidBounds = new THREE.Box3().setFromObject(lid);
    assert.ok(lidBounds.min.y > bounds.min.y + .5, 'lid stays at the top, not below the body');
    assert.ok(Math.abs(lidBounds.max.y - bounds.max.y) < 1e-7);
    assert.ok(new THREE.Vector3(-1, 0, 0).transformDirection(crate.matrixWorld).z > .999);
    assert.equal(crate.position.x, -6); assert.equal(crate.position.z, -4);
  }
});
