import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { animateControl, createStickDirection, pivotControl } from '../src/model-controls.ts';
import type { ControlMotion } from '../src/model-controls.ts';
import type { Axes } from '../src/controller/state.ts';
import { loadControllerModel } from './helpers/assets.ts';

const neutral: Axes = [0, 0, 0, 0];
async function control(name: string) {
  const model = await loadControllerModel();
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.sub(center);
  const meshes: THREE.Mesh[] = [];
  model.traverse(object => { if (object instanceof THREE.Mesh && object.name.startsWith(`${name}__`)) meshes.push(object); });
  assert.ok(meshes.length, `actual asset contains ${name}`);
  const group = new THREE.Group(); group.name = `control-${name}`; model.add(group);
  meshes.forEach(mesh => group.attach(mesh));
  const before = new THREE.Box3().setFromObject(group);
  const part: ControlMotion = { group, origin: pivotControl(name, group, model), glow: 0 };
  return { model, meshes, part, before };
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('controller control pivots preserve real geometry and place hinges at the top/front of the triggers', async () => {
  for (const name of ['l1', 'r1', 'l2', 'r2', 'left-stick', 'right-stick']) {
    const { part, before, meshes } = await control(name);
    const after = new THREE.Box3().setFromObject(part.group);
    assert.ok(before.min.distanceTo(after.min) < 1e-6 && before.max.distanceTo(after.max) < 1e-6, `${name}: regrouping preserves the rest pose`);
    if (name === 'l2' || name === 'r2') {
      assert.ok(part.origin.y > 1.5, 'hinge is at the top of the authored trigger');
      assert.ok(part.origin.z > -.12 && part.origin.z < -.06, 'hinge is near the front edge, not the back/center');
    }
    if (name.endsWith('stick')) {
      close(part.origin.z, .74);
      assert.ok(meshes[0].userData.part === 'head-and-shaft', 'entire artist-made stick assembly tilts together');
    }
  }
});

test('both triggers pull down and into the controller proportionally without translating their hinges', async () => {
  for (const name of ['l2', 'r2']) {
    const { model, part, before } = await control(name);
    const pivotWorld = model.localToWorld(part.origin.clone());
    const hingePoint = new THREE.Vector3(.15, 0, 0);
    const hingeBefore = part.group.localToWorld(hingePoint.clone());
    const tipWorld = new THREE.Vector3(pivotWorld.x, before.min.y, before.min.z);
    const tip = part.group.worldToLocal(tipWorld.clone());
    animateControl(name, part, neutral, .5, 1);
    const half = part.group.localToWorld(tip.clone());
    assert.ok(half.y < tipWorld.y && half.z > tipWorld.z, 'partial pull moves the finger end down/inward');
    animateControl(name, part, neutral, 1, 1);
    const full = part.group.localToWorld(tip.clone());
    assert.ok(full.y < half.y && full.z > half.z, 'full pull continues in the same physical direction');
    assert.ok(full.distanceTo(tipWorld) < .18, 'trigger travel stays compact rather than swinging away');
    assert.ok(part.group.position.distanceTo(part.origin) < 1e-9, 'the hinge is never translated');
    assert.ok(part.group.localToWorld(hingePoint.clone()).distanceTo(hingeBefore) < 1e-9, 'points on the hinge axis stay fixed');
    animateControl(name, part, neutral, 0, 1);
    assert.ok(part.group.localToWorld(tip.clone()).distanceTo(tipWorld) < 1e-9, 'release returns to the exact rest geometry');
  }
});

test('L1 and R1 depress downward into their shoulders without sliding backward', async () => {
  for (const name of ['l1', 'r1']) {
    const { part, before } = await control(name);
    animateControl(name, part, neutral, 1, 1);
    const after = new THREE.Box3().setFromObject(part.group);
    close(after.min.y, before.min.y - .025); close(after.max.y, before.max.y - .025);
    close(after.min.z, before.min.z); close(after.max.z, before.max.z);
    close(after.min.x, before.min.x); close(after.max.x, before.max.x);
    animateControl(name, part, neutral, 0, 1);
    assert.ok(part.group.position.distanceTo(part.origin) < 1e-9);
  }
});

test('stick caps tilt with Gamepad axes and their projected arrows point the same way, including diagonals', async () => {
  for (const name of ['left-stick', 'right-stick']) {
    const { part, meshes } = await control(name);
    const arrow = part.direction = createStickDirection(meshes[0], part.group, new THREE.Texture());
    assert.ok(arrow.geometry.getAttribute('position').count > 100, 'direction decal uses actual curved cap geometry');
    assert.equal(arrow.parent, part.group); assert.equal(arrow.material.depthTest, true);
    const capCenter = new THREE.Box3().setFromObject(meshes[0]).getCenter(new THREE.Vector3());
    capCenter.z = new THREE.Box3().setFromObject(meshes[0]).max.z;
    const restTip = part.group.worldToLocal(capCenter.clone());
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2]]) {
      const axes: Axes = name === 'left-stick' ? [x, y, 0, 0] : [0, 0, x, y];
      animateControl(name, part, axes, 0, 1);
      const tip = part.group.localToWorld(restTip.clone()).sub(capCenter);
      if (x) assert.ok(tip.x * x > 0, `${name}: cap moves in the horizontal input direction`);
      if (y) assert.ok(tip.y * y < 0, `${name}: Gamepad down moves toward model -Y`);
      assert.equal(part.glow, 1, 'movement highlights without L3/R3 being pressed');
      assert.equal(arrow.visible, true);
      arrow.material.map!.updateMatrix();
      // Map the up-pointing image tip back through its texture transform to its visible UV direction.
      const shown = new THREE.Vector2(.5, .85).applyMatrix3(arrow.material.map!.matrix.clone().invert()).subScalar(.5).normalize();
      const expected = new THREE.Vector2(x, -y).normalize();
      assert.ok(shown.distanceTo(expected) < 1e-6, `${name}: arrow matches the real input direction`);
    }
    const lastDirection = arrow.material.map!.rotation;
    animateControl(name, part, neutral, 0, .25);
    assert.equal(arrow.material.map!.rotation, lastDirection, 'release holds direction while fading');
    assert.ok(arrow.visible && arrow.material.opacity > 0 && arrow.material.opacity < .95);
    for (let i = 0; i < 100; i++) animateControl(name, part, neutral, 0, .25);
    assert.equal(arrow.visible, false); assert.equal(arrow.material.opacity, 0); assert.equal(part.glow, 0);
    close(part.group.rotation.x, 0); close(part.group.rotation.y, 0);
    animateControl(name, part, [0.04, 0.04, 0.04, 0.04], 0, 1);
    assert.equal(arrow.visible, false, 'small resting noise does not flash movement feedback');
    animateControl(name, part, neutral, 1, 1);
    close(part.group.position.z, part.origin.z - .035);
    assert.equal(arrow.visible, false, 'a stick click alone is not a direction');
  }
});

test('input travel is time-based and continues settling with unchanged inputs until rest', async () => {
  const states = await Promise.all([30, 60, 120].map(async fps => {
    const { part } = await control('left-stick');
    const blend = 1 - Math.exp(-18 / fps);
    for (let i = 0; i < fps / 5; i++) animateControl('left-stick', part, [1, -.5, 0, 0], .7, blend);
    return part;
  }));
  for (const part of states.slice(1)) {
    close(part.group.rotation.x, states[0].group.rotation.x);
    close(part.group.rotation.y, states[0].group.rotation.y);
    close(part.group.position.z, states[0].group.position.z);
  }
  const part = states[0];
  assert.equal(animateControl('left-stick', part, neutral, 0, .25), true, 'release still animates after its first report');
  for (let i = 0; i < 100; i++) animateControl('left-stick', part, neutral, 0, .25);
  assert.equal(animateControl('left-stick', part, neutral, 0, .25), false, 'settled controls stop requesting redraw');
  assert.ok(part.group.position.distanceTo(part.origin) < 1e-9);
  animateControl('left-stick', part, [1, -1, 0, 0], 1, 1);
  close(part.group.rotation.x, -.29); close(part.group.rotation.y, .29);
  close(part.group.position.z, part.origin.z - .035);
});
