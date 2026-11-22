import { buttonNames } from '../controller/state.ts';
import type { Axes } from '../controller/state.ts';
import type { Settings } from '../controller/calibration.ts';
import { measureRest, REST_DURATION, REST_REFERENCE, SECTORS, StickSweep, TriggerTravel } from './measurements.ts';
import type { RestReading, RestResult, SweepResult, TriggerResult } from './measurements.ts';

export const steps = ['prepare', 'rest', 'sweep', 'triggers', 'buttons'] as const;
export type HealthStep = typeof steps[number];
export interface HealthDevice {
  source: string; key: string; name: string; api: 'hid' | 'gamepad';
  mapping: 'sony-hid' | 'standard' | 'unmapped'; connection: string;
  axes: number; buttons: number;
}
export interface HealthInput { device: HealthDevice | null; axes: Axes; buttons: number[]; timestamp: number; active: boolean; preview: boolean }
export interface ButtonResult { index: number; label: string; presses: number; releases: number; heldAtStart: boolean; excluded: boolean }
export interface HealthReport {
  app: 'PadScope'; kind: 'controller-check'; schemaVersion: 1; createdAt: string;
  device: HealthDevice; browser: string; notes: string; calibration: Settings;
  thresholds: { restDurationMs: number; restReference: number; sectors: number; triggerRelease: number; triggerFull: number };
  stepsFinished: HealthStep[]; skipped: HealthStep[]; interruptions: string[];
  sampling: { observations: number; sourceUpdates: number; activeMs: number };
  rest: (RestResult | null)[]; sweep: SweepResult[]; triggers: (TriggerResult | null)[]; buttons: ButtonResult[];
}

const positionNames = ['South face', 'East face', 'West face', 'North face', 'Left shoulder', 'Right shoulder', 'Left trigger', 'Right trigger', 'Select / back', 'Start / menu', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home / system'];
export function buttonLabel(device: HealthDevice, index: number): string {
  return device.mapping === 'sony-hid' ? buttonNames[index] ?? `Button ${index}` : device.mapping === 'standard' ? positionNames[index] ?? `Button ${index}` : `Button ${index}`;
}
export function stickLabel(device: HealthDevice, index: number): string {
  return device.mapping === 'unmapped' ? `Axes ${index * 2}/${index * 2 + 1}` : index === 0 ? 'Left stick' : 'Right stick';
}

export class HealthSession {
  step: HealthStep = 'prepare';
  status: 'running' | 'paused' | 'finished' = 'running';
  message = '';
  readonly device: HealthDevice;
  readonly calibration: Settings;
  readonly activated = [false, false, false, false];
  readonly supportedSticks: boolean[];
  readonly supportedTriggers: boolean[];
  private warmupExtents: [number, number][] = [];
  private createdAt = new Date().toISOString();
  private restReadings: RestReading[] = [];
  private restStart: number | null = null;
  private restElapsed = 0;
  private sweeps = [new StickSweep(), new StickSweep()];
  private travels = [new TriggerTravel(), new TriggerTravel()];
  private ledger: ButtonResult[];
  private held: boolean[] | null = null;
  private armed: boolean[] = [];
  private finishedSteps: HealthStep[] = [];
  private skipped: HealthStep[] = [];
  private interruptions: string[] = [];
  private lastObservation: number | null = null;
  private lastTimestamp: number | null = null;
  private observations = 0;
  private sourceUpdates = 0;
  private activeMs = 0;

  constructor(device: HealthDevice, settings: Settings) {
    this.device = { ...device };
    this.calibration = { ...settings, centers: [...settings.centers], gyroBias: [...settings.gyroBias] };
    this.supportedSticks = [device.axes >= 2, device.axes >= 4];
    this.supportedTriggers = [6, 7].map(index => device.mapping !== 'unmapped' && device.buttons > index);
    this.ledger = Array.from({ length: Math.min(128, device.buttons) }, (_, index) => ({ index, label: buttonLabel(device, index), presses: 0, releases: 0, heldAtStart: false, excluded: false }));
  }

  get restComplete(): boolean { return this.restElapsed >= REST_DURATION; }
  get restProgress(): number { return Math.min(1, this.restElapsed / REST_DURATION); }
  get ready(): boolean {
    switch (this.step) {
      case 'prepare': return this.supportedSticks.every((supported, index) => !supported || this.activated[index * 2] && this.activated[index * 2 + 1]);
      case 'rest': return this.restComplete;
      case 'sweep': return this.supportedSticks.every((supported, index) => !supported || this.sweeps[index].result().complete);
      case 'triggers': return this.supportedTriggers.every((supported, index) => !supported || this.travels[index].result(null).complete);
      case 'buttons': return this.ledger.every(button => button.excluded || button.presses > 0 && button.releases > 0);
    }
  }

  update(now: number, input: HealthInput): void {
    if (this.status !== 'running') return;
    if (input.preview || input.device && (input.device.source !== this.device.source || input.device.mapping !== this.device.mapping || input.device.axes !== this.device.axes || input.device.buttons !== this.device.buttons)) {
      this.finish('Input source changed. Start a new check for the selected controller.'); return;
    }
    if (!input.active || !input.device) { this.pause('Controller input lost. Reconnect the same source, then resume.'); return; }
    const valid = Number.isFinite(now) && input.axes.every(n => Number.isFinite(n) && Math.abs(n) <= 1) && input.buttons.length === this.device.buttons && input.buttons.every(n => Number.isFinite(n) && n >= 0 && n <= 1);
    if (!valid) { this.pause('Input readings are incomplete or invalid. Reconnect, then resume.'); return; }
    const dt = this.lastObservation === null ? 0 : now - this.lastObservation;
    if (dt < 0 || dt > 250) { this.pause('Sampling was interrupted. Resume to continue; the hands-off window restarts if incomplete.'); return; }
    // These are browser observations, not the controller's hardware report rate.
    if (this.lastObservation !== null && dt < 16) return;
    this.lastObservation = now; this.activeMs += dt; this.observations++;
    if (Number.isFinite(input.timestamp) && input.timestamp > 0 && input.timestamp !== this.lastTimestamp) { this.sourceUpdates++; this.lastTimestamp = input.timestamp; }
    if (this.activeMs > 600000) { this.finish('Ten-minute capture limit reached. Your measurements are retained.'); return; }
    if (this.step === 'prepare') input.axes.forEach((value, index) => {
      const extent = this.warmupExtents[index] ?? [value, value];
      this.warmupExtents[index] = [Math.min(extent[0], value), Math.max(extent[1], value)];
      if (this.warmupExtents[index][1] - this.warmupExtents[index][0] >= .25 && Math.abs(value) <= .2) this.activated[index] = true;
    });
    else if (this.step === 'rest' && !this.restComplete) {
      this.restStart ??= now;
      this.restElapsed = Math.min(REST_DURATION, now - this.restStart);
      this.restReadings.push({ axes: [...input.axes], triggers: this.supportedTriggers.map((supported, index) => supported ? input.buttons[index + 6] : null) });
    } else if (this.step === 'sweep') this.supportedSticks.forEach((supported, index) => { if (supported) this.sweeps[index].add(input.axes[index * 2], input.axes[index * 2 + 1]); });
    else if (this.step === 'triggers') this.supportedTriggers.forEach((supported, index) => { if (supported) this.travels[index].add(input.buttons[index + 6]); });
    else if (this.step === 'buttons') this.captureButtons(input.buttons);
  }

  private captureButtons(values: number[]): void {
    const current = values.map((value, index) => value >= (this.held?.[index] ? .35 : .55));
    this.ledger.forEach((button, index) => {
      if (this.held === null) { if (current[index]) button.heldAtStart = true; return; }
      if (!this.held[index] && current[index]) { button.presses++; this.armed[index] = true; }
      if (this.held[index] && !current[index] && this.armed[index]) { button.releases++; this.armed[index] = false; }
    });
    this.held = current;
  }

  pause(reason = 'Paused. Resume when the controller and page are ready.'): void {
    if (this.status !== 'running') return;
    this.status = 'paused'; this.message = reason;
    if (this.interruptions.length < 20) this.interruptions.push(reason);
    this.lastObservation = null; this.lastTimestamp = null; this.held = null; this.armed = [];
    if (this.step === 'rest' && !this.restComplete) { this.restReadings = []; this.restStart = null; this.restElapsed = 0; }
    // A pull before a pause and a release after it are not one observed cycle.
    if (this.step === 'triggers') this.travels.forEach(travel => travel.breakContinuity());
  }

  resume(device: HealthDevice | null): boolean {
    if (this.status !== 'paused' || device?.source !== this.device.source) return false;
    this.status = 'running'; this.message = ''; return true;
  }

  next(skip = false): boolean {
    if (this.status !== 'running' || !skip && !this.ready) return false;
    if (skip) this.skipped.push(this.step); else this.finishedSteps.push(this.step);
    const index = steps.indexOf(this.step) + 1;
    if (index === steps.length) { this.status = 'finished'; this.message = 'Check finished. Review the recorded coverage and measurements below.'; }
    else { this.step = steps[index]; this.lastObservation = null; this.held = null; this.armed = []; }
    return true;
  }

  repeat(): void {
    if (this.status === 'finished') return;
    if (this.step === 'prepare') { this.activated.fill(false); this.warmupExtents = []; }
    if (this.step === 'rest') { this.restReadings = []; this.restStart = null; this.restElapsed = 0; }
    if (this.step === 'sweep') this.sweeps = [new StickSweep(), new StickSweep()];
    if (this.step === 'triggers') this.travels = [new TriggerTravel(), new TriggerTravel()];
    if (this.step === 'buttons') this.ledger.forEach(button => { button.presses = 0; button.releases = 0; button.heldAtStart = false; });
    this.lastObservation = null; this.held = null; this.armed = [];
    this.message = 'This step was cleared. Repeat the instructions to record a fresh measurement.';
  }

  excludeButton(index: number, excluded: boolean): void {
    if (this.step === 'buttons' && this.ledger[index]) this.ledger[index].excluded = excluded;
  }

  private finish(reason: string): void {
    this.message = reason; this.status = 'finished';
    if (this.interruptions.length < 20) this.interruptions.push(reason);
  }

  stop(): void { if (this.status !== 'finished') this.finish('Stopped early. Partial measurements are retained.'); }

  report(browser = '', notes = ''): HealthReport {
    const rest = this.supportedSticks.map((supported, index) => supported ? measureRest(this.restReadings, index * 2, this.calibration.centers, this.restComplete, this.activated[index * 2] && this.activated[index * 2 + 1]) : null);
    return {
      app: 'PadScope', kind: 'controller-check', schemaVersion: 1, createdAt: this.createdAt, device: { ...this.device },
      browser: browser.slice(0, 1024), notes: notes.slice(0, 1500), calibration: { ...this.calibration, centers: [...this.calibration.centers], gyroBias: [...this.calibration.gyroBias] },
      thresholds: { restDurationMs: REST_DURATION, restReference: REST_REFERENCE, sectors: SECTORS, triggerRelease: .05, triggerFull: .95 },
      stepsFinished: [...this.finishedSteps], skipped: [...this.skipped], interruptions: [...this.interruptions],
      sampling: { observations: this.observations, sourceUpdates: this.sourceUpdates, activeMs: this.activeMs },
      rest, sweep: this.sweeps.map(sweep => sweep.result()),
      triggers: this.supportedTriggers.map((supported, index) => {
        const values = this.restReadings.map(reading => reading.triggers[index]).filter((value): value is number => value !== null);
        return supported ? this.travels[index].result(values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null) : null;
      }),
      buttons: this.ledger.map(button => ({ ...button })),
    };
  }
}

/** Only like-for-like sources/mappings and center calibration are directly comparable. */
export function comparableReports(a: HealthReport, b: HealthReport): boolean {
  return a.device.connection !== 'not recorded' && b.device.connection !== 'not recorded' && a.device.key === b.device.key && a.device.api === b.device.api && a.device.mapping === b.device.mapping && a.device.connection === b.device.connection && a.device.axes === b.device.axes && a.device.buttons === b.device.buttons && a.browser === b.browser && a.calibration.centers.every((center, index) => center === b.calibration.centers[index]);
}
