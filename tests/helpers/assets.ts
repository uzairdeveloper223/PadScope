import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadModel(name: string): Promise<THREE.Group> {
  return loadAsset(new URL(`../../public/models/range/${name}.glb`, import.meta.url));
}

export async function loadControllerModel(): Promise<THREE.Group> {
  return loadAsset(new URL('../../public/models/dualsense.glb', import.meta.url));
}

async function loadAsset(url: URL): Promise<THREE.Group> {
  const bytes = await readFile(url);
  const loader = new GLTFLoader();
  // Keep real geometry, node transforms, and materials. Node has no image
  // decoder; texture paths are checked separately during asset verification.
  loader.register(() => ({ name: 'headless-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
