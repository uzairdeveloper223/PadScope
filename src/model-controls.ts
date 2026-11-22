import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { Axes } from './controller/state.ts';

export type StickDirection = THREE.Mesh<DecalGeometry, THREE.MeshBasicMaterial>;
export interface ControlMotion {
  group: THREE.Group;
  origin: THREE.Vector3;
  glow: number;
  direction?: StickDirection;
}

/** The bundled GLB's shared coordinates have +Y up and +Z toward its front. */
export function pivotControl(name: string, group: THREE.Group, model: THREE.Object3D): THREE.Vector3 {
  const bounds = new THREE.Box3().setFromObject(group).applyMatrix4(model.matrixWorld.clone().invert());
  const pivot = bounds.getCenter(new THREE.Vector3());
  if (name.endsWith('stick')) pivot.z = .74;
  if (name === 'l2' || name === 'r2') {
    pivot.y = bounds.max.y - .10;
    pivot.z = bounds.max.z - .10;
  }
  const children = [...group.children];
  children.forEach(child => model.attach(child));
  group.position.copy(pivot);
  children.forEach(child => group.attach(child));
  return pivot;
}

export function createStickDirection(cap: THREE.Mesh, group: THREE.Group, texture: THREE.Texture): StickDirection {
  texture.center.set(.5, .5);
  // Keep the arrow inside the cap when its texture rotates through diagonals.
  texture.repeat.setScalar(.70 / .46);
  cap.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(cap);
  const center = bounds.getCenter(new THREE.Vector3()); center.z = bounds.max.z;
  const orientation = new THREE.Euler().setFromQuaternion(cap.getWorldQuaternion(new THREE.Quaternion()));
  const geometry = new DecalGeometry(cap, center, orientation, new THREE.Vector3(.70, .70, .22));
  geometry.applyMatrix4(group.matrixWorld.clone().invert());
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: '#ffffff', transparent: true, opacity: 0, toneMapped: false,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  });
  const arrow = new THREE.Mesh(geometry, material);
  arrow.name = `${group.name}-direction`; arrow.visible = false;
  arrow.raycast = () => {};
  group.add(arrow);
  return arrow;
}

const axis = (value: number): number => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
const approach = (current: number, target: number, blend: number): number => Math.abs(target - current) < .0001 ? target : THREE.MathUtils.lerp(current, target, blend);

/** Returns whether travel or feedback changed, including a release with unchanged input. */
export function animateControl(name: string, part: ControlMotion, axes: Axes, pressure: number, blend: number): boolean {
  const { group, origin, direction } = part;
  const value = Number.isFinite(pressure) ? THREE.MathUtils.clamp(pressure, 0, 1) : 0;
  const oldX = group.rotation.x, oldY = group.rotation.y, oldZ = group.position.z, oldHeight = group.position.y;
  const oldGlow = part.glow, oldOpacity = direction?.material.opacity;
  group.position.x = origin.x;
  group.rotation.z = 0;
  if (name.endsWith('stick')) {
    const offset = name === 'left-stick' ? 0 : 2;
    const x = axis(axes[offset]), y = axis(axes[offset + 1]);
    const moving = Math.hypot(x, y) > .08;
    group.position.y = origin.y;
    group.position.z = approach(group.position.z, origin.z - value * .035, blend);
    group.rotation.x = approach(group.rotation.x, y * .29, blend);
    group.rotation.y = approach(group.rotation.y, x * .29, blend);
    // Show movement immediately, then fade without changing the stick's last direction.
    part.glow = moving || value > .05 ? 1 : approach(part.glow, 0, blend);
    if (direction) {
      if (moving) direction.material.map!.rotation = Math.atan2(-x, -y);
      direction.material.opacity = approach(direction.material.opacity, moving ? .95 : 0, blend);
      direction.visible = direction.material.opacity > .001;
    }
  } else {
    part.glow = value;
    group.rotation.y = 0;
    if (name === 'l2' || name === 'r2') {
      group.position.copy(origin);
      group.rotation.x = approach(group.rotation.x, -value * .21, blend);
    } else {
      group.rotation.x = 0;
      const shoulder = name === 'l1' || name === 'r1';
      group.position.y = shoulder ? approach(group.position.y, origin.y - value * .025, blend) : origin.y;
      group.position.z = shoulder ? origin.z : origin.z - value * .035;
    }
  }
  return group.rotation.x !== oldX || group.rotation.y !== oldY || group.position.z !== oldZ || group.position.y !== oldHeight || part.glow !== oldGlow || direction?.material.opacity !== oldOpacity;
}
