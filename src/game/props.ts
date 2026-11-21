import * as THREE from 'three';

export function placeCrate(source: THREE.Group, x: number, z: number, scale: number): THREE.Group {
  const prop = source.clone(true);
  // Source +Y is the lid/top; -X is the latch/front. Keep the lid upward
  // and turn the latch toward the player rather than showing the end panels.
  prop.rotation.set(0, Math.PI / 2, 0);
  prop.scale.setScalar(scale);
  const bounds = new THREE.Box3().setFromObject(prop);
  prop.position.set(x, -bounds.min.y, z);
  return prop;
}
