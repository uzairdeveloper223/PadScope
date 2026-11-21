import { Quaternion } from 'three';
import { RangeAim, defaultRangeSettings } from './aim.ts';
import type { Rotation, Vector3 } from '../controller/state.ts';

/** Fit the enclosing sphere at every orientation, including maximum zoom. */
export function inspectionDistance(radius: number, aspect: number, fov: number, zoom: number): number {
  const vertical = fov * Math.PI / 360;
  const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
  return radius / Math.sin(halfAngle) / (.5 * zoom);
}

/** Independent grip reference; inspection uses physical rotation, never aim scaling/clamping. */
export class InspectionPose {
  readonly rotation = new Quaternion();
  private grip = new RangeAim();
  private settings = defaultRangeSettings();
  frozen = false;

  get centered(): boolean { return this.grip.centered; }
  get turnDegrees(): number { return this.rotation.angleTo(new Quaternion()) * 180 / Math.PI; }

  center(pose: Rotation, acceleration: Vector3): boolean {
    if (!this.grip.captureGrip(pose, acceleration)) return false;
    this.frozen = false; this.update(pose);
    return true;
  }

  update(pose: Rotation): void {
    if (!this.centered || this.frozen || !pose.every(Number.isFinite)) return;
    this.grip.updateGyro(pose, this.settings, 1, 42);
    this.rotation.copy(this.grip.gunPose);
  }

  toggleFreeze(): void { if (this.centered) this.frozen = !this.frozen; }
  clear(): void { this.grip.clearGrip(); this.frozen = false; }
}
