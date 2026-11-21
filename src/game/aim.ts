import { Matrix4, Quaternion, Vector2, Vector3 } from 'three';
import type { Axes, Rotation, Vector3 as SensorVector } from '../controller/state.ts';

export interface RangeSettings {
  version: 2;
  weapon: BlasterId;
  mode: 'stick' | 'gyro';
  stick: 'left' | 'right';
  fire: number;
  recenter: number;
  pause: number;
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
}
export type BlasterId = 'compact' | 'carbine' | 'longshot';

export const defaultRangeSettings = (): RangeSettings => ({ version: 2, weapon: 'compact', mode: 'stick', stick: 'right', fire: 7, recenter: 2, pause: 9, sensitivity: 1, invertX: false, invertY: false });

export function validRangeSettings(value: unknown): value is RangeSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as RangeSettings;
  return s.version === 2 && ['compact', 'carbine', 'longshot'].includes(s.weapon) && ['stick', 'gyro'].includes(s.mode) && ['left', 'right'].includes(s.stick) &&
    [s.fire, s.recenter, s.pause].every(n => Number.isInteger(n) && n >= 0 && n < 64) &&
    new Set([s.fire, s.recenter, s.pause]).size === 3 && Number.isFinite(s.sensitivity) && s.sensitivity >= .4 && s.sensitivity <= 2.5 &&
    typeof s.invertX === 'boolean' && typeof s.invertY === 'boolean';
}

export function restoreRangeSettings(value: unknown): RangeSettings {
  if (value && typeof value === 'object' && 'version' in value && value.version === 1) value = { ...value, version: 2, weapon: 'compact' };
  return validRangeSettings(value) ? value : defaultRangeSettings();
}

export class RangeAim {
  readonly cursor = new Vector2();
  readonly weapon = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  readonly gunPose = new Quaternion();
  inside = true;
  private neutral: Quaternion | null = null;
  private basis = new Quaternion();
  private inverseBasis = new Quaternion();
  private delta = new Quaternion();
  private direction = new Vector3();

  get centered(): boolean { return this.neutral !== null; }
  clearGrip(): void { this.neutral = null; this.gunPose.identity(); this.weapon.setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2); this.centerStick(); }
  centerStick(): void { this.cursor.set(0, 0); this.inside = true; }

  captureGrip(pose: Rotation, acceleration: SensorVector): boolean {
    if (![...pose, ...acceleration].every(Number.isFinite)) return false;
    const up = new Vector3(acceleration[0], -acceleration[2], acceleration[1]);
    if (Math.abs(up.length() - 1) > .25) return false;
    // The left handle points along -X. Project measured up perpendicular to it
    // so the sideways grip's roll, not the model's front view, defines screen-up.
    const forward = new Vector3(-1, 0, 0);
    up.addScaledVector(forward, -up.dot(forward));
    if (up.length() < .25) return false;
    up.normalize();
    const right = forward.clone().cross(up).normalize();
    this.basis.setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward.clone().negate())).invert();
    this.inverseBasis.copy(this.basis).invert();
    this.neutral = new Quaternion(...pose).normalize();
    this.centerStick();
    return true;
  }

  updateStick(axes: Axes, dt: number, settings: RangeSettings, aspect: number): void {
    const offset = settings.stick === 'left' ? 0 : 2;
    const curve = (value: number) => value * Math.abs(value);
    this.cursor.x += curve(axes[offset]) * settings.sensitivity * 2.4 * dt / aspect * (settings.invertX ? -1 : 1);
    this.cursor.y -= curve(axes[offset + 1]) * settings.sensitivity * 2.4 * dt * (settings.invertY ? -1 : 1);
    this.cursor.clampScalar(-.96, .96);
    this.inside = true;
  }

  updateGyro(pose: Rotation, settings: RangeSettings, aspect: number, fov: number): void {
    if (!this.neutral) { this.inside = false; return; }
    this.delta.copy(this.neutral).invert().multiply(new Quaternion(...pose));
    this.weapon.copy(this.basis).multiply(this.delta).normalize();
    // Express grip motion in a screen-aligned gun basis (-Z forward, +Y up).
    this.gunPose.copy(this.weapon).multiply(this.inverseBasis).normalize();
    this.direction.set(-1, 0, 0).applyQuaternion(this.weapon);
    const tangent = Math.tan(fov * Math.PI / 360);
    const forward = Math.max(.01, -this.direction.z);
    const x = this.direction.x / forward / tangent / aspect * settings.sensitivity * (settings.invertX ? -1 : 1);
    const y = this.direction.y / forward / tangent * settings.sensitivity * (settings.invertY ? -1 : 1);
    this.inside = this.direction.z < -.1 && Math.abs(x) <= 1 && Math.abs(y) <= 1;
    this.cursor.set(Math.max(-.96, Math.min(.96, x)), Math.max(-.96, Math.min(.96, y)));
  }
}
