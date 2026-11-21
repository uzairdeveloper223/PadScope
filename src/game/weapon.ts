import * as THREE from 'three';
import type { BlasterId } from './aim.ts';
import { blasterIds, prepareBlaster } from './blasters.ts';
import type { BlasterModel } from './blasters.ts';

export class RangeWeapon {
  readonly group = new THREE.Group();
  private blasters = new Map<BlasterId, BlasterModel>();
  private selected: BlasterId = 'compact';
  private camera: THREE.PerspectiveCamera;
  private ray = new THREE.Raycaster();
  private matrix = new THREE.Matrix4();
  private desired = new THREE.Quaternion();
  private restingRotation = new THREE.Quaternion();
  private cameraInverse = new THREE.Quaternion();
  private recoilRotation = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private target = new THREE.Vector3();
  private muzzle = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffdf92', toneMapped: false }));
  private recoil = 0;
  private flash = 0;

  constructor(models: Record<BlasterId, THREE.Group>, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    for (const id of blasterIds) {
      const blaster = prepareBlaster(models[id], { compact: 1.15, carbine: 1.35, longshot: 1.5 }[id]);
      blaster.model.visible = id === this.selected;
      this.group.add(blaster.model); this.blasters.set(id, blaster);
    }
    this.group.add(this.muzzle); this.muzzle.visible = false;
    this.group.position.set(.5, -.55, -2.2);
    camera.add(this.group);
  }

  select(id: BlasterId): void {
    if (this.selected === id) return;
    this.selected = id; this.recoil = 0; this.flash = 0;
    for (const [key, blaster] of this.blasters) blaster.model.visible = key === id;
  }

  update(cursor: THREE.Vector2, gunPose: THREE.Quaternion, gyro: boolean, inside: boolean, dt: number): void {
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.flash = Math.max(0, this.flash - dt);
    this.ray.setFromCamera(cursor, this.camera);
    this.target.copy(this.ray.ray.direction).applyQuaternion(this.cameraInverse.copy(this.camera.quaternion).invert()).multiplyScalar(15);
    this.group.position.set(Math.min(.55, this.camera.aspect * .28) + cursor.x * .09, -.55 + cursor.y * .035, -2.2 + this.recoil * .1);
    this.up.set(0, 1, 0);
    if (gyro) this.up.applyQuaternion(gunPose);
    if (gyro && !inside) this.desired.copy(gunPose);
    else {
      // The source model's -Z barrel looks at the projected reticle point.
      // Gravity-derived roll is retained in gyro mode; sticks keep the gun upright.
      this.matrix.lookAt(this.group.position, this.target, this.up);
      this.desired.setFromRotationMatrix(this.matrix);
    }
    this.restingRotation.slerp(this.desired, 1 - Math.exp(-dt * (gyro ? 35 : 22)));
    this.recoilRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.recoil * .055);
    this.group.quaternion.copy(this.restingRotation).multiply(this.recoilRotation);
    this.muzzle.position.copy(this.blasters.get(this.selected)!.muzzle);
    this.muzzle.visible = this.flash > 0;
    this.muzzle.scale.setScalar(.7 + this.flash * 8);
    this.group.updateWorldMatrix(true, true);
  }

  fire(): THREE.Vector3 {
    this.recoil = 1; this.flash = .06;
    return this.group.localToWorld(this.blasters.get(this.selected)!.muzzle.clone());
  }
}
