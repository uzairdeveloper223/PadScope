import { calibratedStick } from '../controller/calibration.ts';
import type { Axes } from '../controller/state.ts';

export const REST_DURATION = 5000;
export const SECTORS = 24;
export const REST_REFERENCE = .05;
export interface RestReading { axes: Axes; triggers: (number | null)[] }
export interface RestResult {
  samples: number; complete: boolean; verified: boolean; stable: boolean;
  mean: [number, number]; meanRadius: number; p95: number; peak: number; jitter: number;
  outsideReference: number; centeredP95: number; suggestedDeadzone: number | null;
}
export interface SweepResult {
  sectors: (number | null)[]; covered: number; complete: boolean;
  minRadius: number | null; maxRadius: number | null; circularityError: number | null;
  extent: [number, number, number, number] | null;
}
export interface TriggerResult {
  rest: number | null; min: number | null; max: number | null; intermediate: boolean;
  releasedBefore: boolean; cycles: number; complete: boolean;
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
export function percentile95(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
}

export function measureRest(readings: RestReading[], offset: number, centers: Axes, complete: boolean, verified: boolean): RestResult | null {
  if (!readings.length) return null;
  const points = readings.map(reading => [reading.axes[offset], reading.axes[offset + 1]]);
  const center: [number, number] = [mean(points.map(p => p[0])), mean(points.map(p => p[1]))];
  const radii = points.map(p => Math.hypot(...p));
  const deviations = points.map(p => Math.hypot(p[0] - center[0], p[1] - center[1]));
  const centeredP95 = percentile95(points.map(p => Math.hypot(...calibratedStick(p[0], p[1], centers[offset], centers[offset + 1], 0))));
  const stable = Math.hypot(...center) <= .35 && Math.max(...deviations) <= .06;
  const estimate = Math.ceil((centeredP95 + .01 - 1e-12) * 100) / 100;
  return {
    samples: readings.length, complete, verified, stable, mean: center, meanRadius: mean(radii),
    p95: percentile95(radii), peak: Math.max(...radii), jitter: Math.sqrt(mean(deviations.map(d => d * d))),
    outsideReference: radii.filter(radius => radius > REST_REFERENCE).length / radii.length,
    centeredP95, suggestedDeadzone: complete && verified && stable && estimate <= .3 ? estimate : null,
  };
}

export class StickSweep {
  private sectors: (number | null)[] = Array(SECTORS).fill(null);
  private extent: [number, number, number, number] | null = null;

  add(x: number, y: number): void {
    if (!this.extent) this.extent = [x, x, y, y];
    else this.extent = [Math.min(this.extent[0], x), Math.max(this.extent[1], x), Math.min(this.extent[2], y), Math.max(this.extent[3], y)];
    const radius = Math.hypot(x, y);
    if (radius < .5) return;
    const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.min(SECTORS - 1, Math.floor(angle / (Math.PI * 2) * SECTORS));
    this.sectors[sector] = Math.max(this.sectors[sector] ?? 0, radius);
  }

  result(): SweepResult {
    const radii = this.sectors.filter((radius): radius is number => radius !== null);
    return {
      sectors: [...this.sectors], covered: radii.length, complete: radii.length === SECTORS,
      minRadius: radii.length ? Math.min(...radii) : null, maxRadius: radii.length ? Math.max(...radii) : null,
      circularityError: radii.length ? mean(radii.map(radius => Math.abs(radius - 1))) * 100 : null,
      extent: this.extent ? [...this.extent] : null,
    };
  }
}

export class TriggerTravel {
  private minimum: number | null = null;
  private maximum: number | null = null;
  private intermediate = false;
  private releasedBefore = false;
  private pulled = false;
  private cycles = 0;

  add(value: number): void {
    this.minimum = Math.min(this.minimum ?? value, value);
    this.maximum = Math.max(this.maximum ?? value, value);
    if (value > .02 && value < .98) this.intermediate = true;
    if (value <= .05) {
      if (this.pulled) this.cycles++;
      this.releasedBefore = true; this.pulled = false;
    } else if (value >= .95 && this.releasedBefore) this.pulled = true;
  }

  breakContinuity(): void { this.releasedBefore = false; this.pulled = false; }

  result(rest: number | null): TriggerResult {
    return { rest, min: this.minimum, max: this.maximum, intermediate: this.intermediate, releasedBefore: this.releasedBefore, cycles: this.cycles, complete: this.cycles > 0 };
  }
}
