import * as THREE from 'three';

interface Target { object: THREE.Group; small: boolean; cooldown: number; index: number }
export interface RangeHit { hit: boolean; bullseye: boolean; small: boolean }

export class TargetField {
  readonly group = new THREE.Group();
  readonly lastImpact = new THREE.Vector3();
  private targets: Target[] = [];
  private ray = new THREE.Raycaster();
  private camera: THREE.PerspectiveCamera;
  private mounts: THREE.Group[] = [];

  constructor(large: THREE.Object3D, small: THREE.Object3D, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    for (let index = 0; index < 5; index++) {
      const isSmall = index === 1 || index === 4;
      const object = new THREE.Group();
      const model = (isSmall ? small : large).clone(true);
      // The colored face is on -X in Kenney's source; face it toward +Z/player.
      model.rotation.y = Math.PI / 2;
      model.scale.setScalar(isSmall ? 4 : 3.5);
      object.add(model); this.group.add(object);
      this.targets.push({ object, small: isSmall, cooldown: 0, index });
    }
    const mounts = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#607887', roughness: .75 });
    for (const target of this.targets) {
      const mount = new THREE.Group();
      const stemHeight = target.small ? .35 : .155;
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(.3, .13, .22), material);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(.045, stemHeight, .045), material);
      stem.position.y = stemHeight / 2;
      mount.add(carriage, stem); mounts.add(mount); this.mounts.push(mount);
    }
    this.group.add(mounts);
    this.reset();
  }

  reset(): void {
    for (const target of this.targets) { target.cooldown = 0; target.object.visible = true; target.object.scale.setScalar(1); }
    this.advance(0, 0);
  }

  advance(dt: number, elapsed: number): void {
    for (const target of this.targets) {
      target.cooldown = Math.max(0, target.cooldown - dt);
      target.object.visible = target.cooldown < .22;
      target.object.scale.setScalar(target.cooldown ? Math.max(.05, 1 - target.cooldown / .22) : 1);
      const row = Math.floor(target.index / 2);
      const distance = 12 + row * 3;
      const halfWidth = Math.tan(this.camera.fov * Math.PI / 360) * distance * this.camera.aspect;
      target.object.position.set(Math.sin(elapsed * (.42 + target.index * .045) + target.index * 2.3) * halfWidth * .7, 2.15 + row * 1.5, -3 - row * 3);
      this.mounts[target.index].position.set(target.object.position.x, target.object.position.y - .75, target.object.position.z);
    }
    this.group.updateWorldMatrix(true, true);
  }

  shoot(cursor: THREE.Vector2): RangeHit {
    this.ray.setFromCamera(cursor, this.camera);
    this.ray.ray.at(24, this.lastImpact);
    const candidates = this.targets.filter(t => !t.cooldown);
    const hit = this.ray.intersectObjects(candidates.map(t => t.object), true)[0];
    if (!hit) return { hit: false, bullseye: false, small: false };
    this.lastImpact.copy(hit.point);
    const target = candidates.find(t => {
      let object: THREE.Object3D | null = hit.object;
      while (object) { if (object === t.object) return true; object = object.parent; }
      return false;
    })!;
    const local = target.object.worldToLocal(hit.point.clone());
    target.cooldown = .8;
    return { hit: true, bullseye: Math.hypot(local.x, local.y) < (target.small ? .14 : .2), small: target.small };
  }
}
