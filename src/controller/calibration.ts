import { Quaternion, Vector3 as SpatialVector } from 'three';
import type { Axes, Rotation, Vector3 } from './state.ts';

export interface Settings { version: 2; centers: Axes; deadzone: number; gyroBias: Vector3 }
export const defaultSettings = (): Settings => ({ version: 2, centers: [0, 0, 0, 0], deadzone: .05, gyroBias: [0, 0, 0] });

export function calibratedStick(x: number, y: number, cx: number, cy: number, deadzone: number): [number, number] {
  const normalize = (value: number, center: number) => Math.max(-1, Math.min(1, (value - center) / (value >= center ? 1 - center : 1 + center)));
  const nx = normalize(x, cx), ny = normalize(y, cy);
  const radius = Math.hypot(nx, ny);
  if (radius <= deadzone) return [0, 0];
  const magnitude = Math.min(1, (radius - deadzone) / (1 - deadzone));
  return [nx / radius * magnitude, ny / radius * magnitude];
}

export function correctedAxes(axes: Axes, settings: Settings): Axes {
  return [...calibratedStick(axes[0], axes[1], settings.centers[0], settings.centers[1], settings.deadzone), ...calibratedStick(axes[2], axes[3], settings.centers[2], settings.centers[3], settings.deadzone)];
}

export function centerFromSamples(samples: Axes[]): Axes | null {
  if (samples.length < 20) return null;
  const centers = [0, 1, 2, 3].map(axis => samples.reduce((sum, sample) => sum + sample[axis], 0) / samples.length) as Axes;
  if (centers.some((center, axis) => Math.abs(center) > .35 || samples.some(s => Math.abs(s[axis] - center) > .06))) return null;
  return centers;
}

export function readSettings(key: string): Settings {
  try {
    const data = JSON.parse(localStorage.getItem(`padscope:${key}`) ?? 'null');
    const vector = (value: unknown, length: number, bound: number): boolean => Array.isArray(value) && value.length === length && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= bound);
    if ([1, 2].includes(data?.version) && vector(data.centers, 4, .35) && vector(data.gyroBias, 3, 100) && typeof data.deadzone === 'number' && Number.isFinite(data.deadzone) && data.deadzone >= 0 && data.deadzone <= .3) {
      return { version: 2, centers: data.centers, deadzone: data.deadzone, gyroBias: data.gyroBias };
    }
  } catch { /* Private browsing or invalid stored settings: use defaults. */ }
  return defaultSettings();
}

export function saveSettings(key: string, settings: Settings): boolean {
  try { localStorage.setItem(`padscope:${key}`, JSON.stringify(settings)); return true; } catch { return false; }
}

export class MotionTracker {
  private rotation = new Quaternion();
  private reference: Quaternion | null = null;
  private previous: number | null = null;
  private axis = new SpatialVector();
  private gravity = new SpatialVector();
  private up = new SpatialVector(0, 1, 0);
  private delta = new Quaternion();
  private correction = new Quaternion();
  private relative = new Quaternion();
  private autoBias = new SpatialVector();
  private learnedBias = false;
  private resting = false;
  private restTime = 0;
  private restRates = new SpatialVector();
  private restAcceleration: SpatialVector | null = null;
  private restRateAnchor: SpatialVector | null = null;

  get stationary(): boolean { return this.resting; }

  reset(): void { this.rotation.identity(); this.reference = null; this.previous = null; this.clearDrift(); }
  recenter(): void { this.reference = this.rotation.clone(); this.clearDrift(); }

  private clearRestWindow(): void {
    this.resting = false; this.restTime = 0; this.restRates.set(0, 0, 0);
    this.restAcceleration = null; this.restRateAnchor = null;
  }

  private clearDrift(): void { this.clearRestWindow(); this.autoBias.set(0, 0, 0); this.learnedBias = false; }

  private detectRest(dt: number): boolean {
    // Learn a small initial sensor offset, then use a tighter movement threshold.
    // A fixed acceleration anchor prevents gradual tilting from counting as rest.
    const maxRate = this.learnedBias ? .65 : 3; // degrees / second
    if (dt <= 0 || Math.abs(this.gravity.length() - 1) > .2 || this.axis.length() > maxRate) {
      this.clearRestWindow(); return false;
    }
    if (this.restAcceleration && (this.gravity.distanceTo(this.restAcceleration) > .025 ||
      !this.resting && this.axis.distanceTo(this.restRateAnchor!) > .6)) this.clearRestWindow();
    if (!this.restAcceleration) {
      this.restAcceleration = this.gravity.clone(); this.restRateAnchor = this.axis.clone();
    }
    if (this.resting) {
      // Follow slow temperature-related bias changes only during confirmed rest.
      this.autoBias.addScaledVector(this.axis, 1 - Math.exp(-dt / 3));
    } else {
      this.restTime += dt;
      this.restRates.addScaledVector(this.axis, dt);
      if (this.restTime >= .6) {
        this.autoBias.addScaledVector(this.restRates, 1 / this.restTime);
        this.learnedBias = true; this.resting = true;
      }
    }
    return this.resting;
  }

  private pose(): Rotation {
    this.relative.copy(this.reference ?? this.rotation).invert().multiply(this.rotation).normalize();
    return this.relative.toArray() as Rotation;
  }

  update(gyro: Vector3, accel: Vector3, timestamp: number, bias: Vector3): Rotation {
    if (![...gyro, ...accel, ...bias, timestamp].every(Number.isFinite) || this.previous !== null && timestamp <= this.previous) return this.pose();
    const dt = this.previous === null ? 0 : (timestamp - this.previous) / 1000;
    this.previous = timestamp;
    // Do not integrate missing reports when a tab resumes or hardware reconnects.
    if (dt > .1) { this.clearRestWindow(); return this.pose(); }
    // Sony sensor basis: X right, Y out of the face, Z toward the handles.
    // Model basis: X right, Y toward USB, Z out of the face: (x, -z, y).
    // Integrate about LOCAL axes; adding Euler angles mixes axes after a turn.
    this.axis.set(gyro[0] - bias[0], -(gyro[2] - bias[2]), gyro[1] - bias[1]);
    this.axis.sub(this.autoBias);
    const speed = this.axis.length();
    this.gravity.set(accel[0], -accel[2], accel[1]);
    const stationary = this.detectRest(dt);
    if (!stationary && speed > 0 && dt > 0) {
      this.delta.setFromAxisAngle(this.axis.multiplyScalar(1 / speed), speed * Math.PI / 180 * dt);
      this.rotation.multiply(this.delta).normalize();
    }
    const magnitude = this.gravity.length();
    if (!stationary && magnitude > .8 && magnitude < 1.2 && (this.reference === null || speed < 20)) {
      this.gravity.multiplyScalar(1 / magnitude).applyQuaternion(this.rotation);
      this.delta.setFromUnitVectors(this.gravity, this.up);
      this.correction.identity().slerp(this.delta, this.reference === null ? 1 : 1 - Math.exp(-dt * 1.5));
      this.rotation.premultiply(this.correction).normalize();
    }
    // A newly connected controller starts face-on in its current resting pose.
    // Pose references are session-local; saved stick centers/bias survive reloads.
    if (this.reference === null) this.reference = this.rotation.clone();
    return this.pose();
  }
}
