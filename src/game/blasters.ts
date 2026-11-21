import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BlasterId } from './aim.ts';

export const blasterIds = ['compact', 'carbine', 'longshot'] as const;
export const blasterAssets: Record<BlasterId, string> = { compact: 'blaster-a', carbine: 'blaster-p', longshot: 'blaster-e' };
export interface BlasterModel { model: THREE.Group; muzzle: THREE.Vector3; radius: number }

let models: Promise<Record<BlasterId, THREE.Group>> | null = null;

export async function loadBlasters(): Promise<Record<BlasterId, THREE.Group>> {
  models ??= Promise.all(blasterIds.map(async id => {
    const asset = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/range/${blasterAssets[id]}.glb`);
    return [id, asset.scene] as const;
  })).then(entries => Object.fromEntries(entries) as Record<BlasterId, THREE.Group>).catch(error => { models = null; throw error; });
  const loaded = await models;
  return Object.fromEntries(blasterIds.map(id => [id, loaded[id].clone(true)])) as Record<BlasterId, THREE.Group>;
}

/** Kenney's blasters have +Y up and their actual barrel at the -Z end. */
export function prepareBlaster(source: THREE.Group, length: number): BlasterModel {
  const bounds = new THREE.Box3().setFromObject(source);
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const scale = length / size.z;
  const muzzle = new THREE.Vector3(), vertex = new THREE.Vector3();
  let count = 0;
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      if (vertex.z <= bounds.min.z + .008) { muzzle.add(vertex); count++; }
    }
  });
  muzzle.multiplyScalar(1 / Math.max(1, count)).sub(center).multiplyScalar(scale);
  const model = new THREE.Group();
  source.position.sub(center);
  model.add(source); model.scale.setScalar(scale);
  const radius = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length() / 2;
  return { model, muzzle, radius };
}
