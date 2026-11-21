import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TargetField } from '../src/game/targets.ts';
import { loadModel } from './helpers/assets.ts';

function camera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(42, aspect, .1, 80);
  camera.position.set(0, 3, 9); camera.lookAt(0, 3, -5); camera.updateMatrixWorld();
  return camera;
}

test('real Kenney target meshes score bullseyes, misses, and only respawn after cooldown', async () => {
  const [large, small] = await Promise.all(['target-large', 'target-small'].map(loadModel));
  const view = camera(16 / 9), field = new TargetField(large, small, view);
  const at = (index: number) => { const point = field.group.children[index].getWorldPosition(new THREE.Vector3()).project(view); return new THREE.Vector2(point.x, point.y); };
  assert.deepEqual(field.shoot(at(0)), { hit: true, bullseye: true, small: false });
  assert.equal(field.shoot(at(0)).hit, false);
  field.advance(.4, 0); assert.equal(field.group.children[0].visible, false);
  field.advance(.39, 0); assert.equal(field.shoot(at(0)).hit, false);
  field.advance(.02, 0); assert.equal(field.shoot(at(0)).hit, true);
  assert.deepEqual(field.shoot(at(1)), { hit: true, bullseye: true, small: true });
  assert.equal(field.shoot(new THREE.Vector2(.95, .9)).hit, false);
  field.reset(); assert.equal(field.shoot(at(0)).hit, true);
});

test('all target geometry remains inside the camera throughout a round on narrow and wide fields', async () => {
  const [large, small] = await Promise.all(['target-large', 'target-small'].map(loadModel));
  for (const aspect of [.6, 1, 4 / 3, 16 / 9, 2.5]) {
    const view = camera(aspect), field = new TargetField(large, small, view);
    for (let elapsed = 0; elapsed <= 60; elapsed += .5) {
      field.advance(0, elapsed);
      for (const target of [...field.group.children.slice(0, 5), ...field.group.children[5].children]) {
        const bounds = new THREE.Box3().setFromObject(target);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(view);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `target clipped at aspect ${aspect}, time ${elapsed}`);
        }
      }
    }
  }
});
