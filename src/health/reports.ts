import type { HealthReport } from './session.ts';
import { steps, stickLabel } from './session.ts';

const HISTORY_KEY = 'padscope:health-history';
export const percent = (value: number | null): string => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export const decimal = (value: number | null): string => value === null ? '—' : value.toFixed(3);
export function restStatus(rest: HealthReport['rest'][number]): string {
  if (!rest) return 'Not tested';
  if (!rest.complete) return 'Partial window';
  if (!rest.verified) return 'Input not verified';
  if (!rest.stable) return 'Repeat hands off';
  return rest.p95 > .05 ? 'Above 5% reference' : 'Within 5% reference';
}

export function reportText(report: HealthReport): string {
  const lines = [
    'PadScope — Controller check', `Test started: ${report.createdAt}`, `Controller: ${report.device.name}`,
    `Source: ${report.device.api.toUpperCase()} · ${report.device.connection} · ${report.device.mapping}`,
    `Browser: ${report.browser}`, `Exposed inputs: ${report.device.axes} axes / ${report.device.buttons} buttons`,
    `Notes: ${report.notes || 'None'}`, '',
    'Reads normalized input before PadScope calibration. Firmware/OS/browser filtering can still apply.',
    'These are observations, not a hardware certification or a latency measurement.',
    `Finished steps: ${report.stepsFinished.join(', ') || 'None'}`, `Skipped steps: ${report.skipped.join(', ') || 'None'}`,
    `Browser observations: ${report.sampling.observations}; observed source timestamps: ${report.sampling.sourceUpdates}; active time: ${(report.sampling.activeMs / 1000).toFixed(1)}s`,
    `Calibration at start: centers ${report.calibration.centers.map(decimal).join(' / ')}; deadzone ${percent(report.calibration.deadzone)}`,
    '', 'HANDS OFF',
  ];
  report.rest.forEach((rest, index) => {
    lines.push(`${stickLabel(report.device, index)}: ${restStatus(rest)}`);
    if (rest) lines.push(`  ${rest.samples} observations; mean X/Y ${rest.mean.map(decimal).join(' / ')}; mean radius ${percent(rest.meanRadius)}; P95 ${percent(rest.p95)}; peak ${percent(rest.peak)}; jitter RMS ${percent(rest.jitter)}; above 5% ${percent(rest.outsideReference)}`, `  After saved centers, before deadzone: P95 ${percent(rest.centeredP95)}; suggested PadScope deadzone ${percent(rest.suggestedDeadzone)}`);
  });
  lines.push('', 'STICK SWEEPS');
  report.sweep.forEach((sweep, index) => lines.push(`${stickLabel(report.device, index)}: ${sweep.covered}/24 directions; ${sweep.complete ? 'full coverage' : 'partial / untested'}; outer radius ${percent(sweep.minRadius)}–${percent(sweep.maxRadius)}; unit-circle deviation ${sweep.circularityError === null ? '—' : `${sweep.circularityError.toFixed(1)}%`}`, `  X min/max, Y min/max: ${sweep.extent?.map(decimal).join(' / ') ?? 'Not tested'}`, `  Sector peak radii: ${sweep.sectors.map(decimal).join(', ')}`));
  lines.push('Unit-circle deviation describes output shape, not a pass/fail tolerance.', '', 'TRIGGERS');
  report.triggers.forEach((trigger, index) => lines.push(`${index === 0 ? 'Left' : 'Right'} trigger: ${trigger ? `rest ${percent(trigger.rest)}; min ${percent(trigger.min)}; max ${percent(trigger.max)}; full pull/release cycles ${trigger.cycles}; ${trigger.intermediate ? 'intermediate values observed' : 'no intermediate values observed'}` : 'Not identified / unavailable'}`));
  lines.push('A full cycle observes release ≤5%, pull ≥95%, then release ≤5%. Trigger stops/profiles affect these readings.', '', 'BUTTONS');
  report.buttons.forEach(button => lines.push(`${button.index} · ${button.label}: ${button.excluded ? 'excluded by user (unavailable on controller)' : button.presses > 0 && button.releases > 0 ? 'press and release observed' : 'not fully tested'}; ${button.presses} presses / ${button.releases} releases${button.heldAtStart ? '; held at start/resume' : ''}`));
  lines.push('', 'INTERRUPTIONS', ...report.interruptions.length ? report.interruptions : ['None'], '', 'Method: https://github.com/uzairdeveloper223/PadScope/blob/main/docs/HEALTH_CHECK.md');
  return lines.join('\n');
}

/** Validate persisted measurements before they are rendered or compared. */
export function isHealthReport(value: unknown): value is HealthReport {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, any>;
  const number = (n: unknown, min = 0, max = 1e7): boolean => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const nullable = (n: unknown, max = 2): boolean => n === null || number(n, 0, max);
  const string = (s: unknown, max: number): boolean => typeof s === 'string' && s.length <= max;
  const array = (a: unknown, length: number, check: (item: any) => boolean): boolean => Array.isArray(a) && a.length === length && a.every(check);
  const bool = (b: unknown): boolean => typeof b === 'boolean';
  if (data.app !== 'PadScope' || data.kind !== 'controller-check' || data.schemaVersion !== 1 || !string(data.createdAt, 40) || !Number.isFinite(Date.parse(data.createdAt)) || !string(data.browser, 1024) || !string(data.notes, 1500)) return false;
  const d = data.device, c = data.calibration, t = data.thresholds, s = data.sampling;
  if (!d || !string(d.source, 2048) || !string(d.key, 1024) || !string(d.name, 1024) || !['hid', 'gamepad'].includes(d.api) || !['sony-hid', 'standard', 'unmapped'].includes(d.mapping) || !['usb', 'bluetooth', 'wireless receiver', 'not recorded'].includes(d.connection) || !number(d.axes, 0, 64) || !number(d.buttons, 0, 128) || !Number.isInteger(d.axes) || !Number.isInteger(d.buttons)) return false;
  if (!c || c.version !== 2 || !array(c.centers, 4, n => number(n, -.35, .35)) || !array(c.gyroBias, 3, n => number(n, -100, 100)) || !number(c.deadzone, 0, .3)) return false;
  if (!t || t.restDurationMs !== 5000 || t.restReference !== .05 || t.sectors !== 24 || t.triggerRelease !== .05 || t.triggerFull !== .95 || !s || !number(s.observations) || !number(s.sourceUpdates) || !number(s.activeMs, 0, 601000)) return false;
  if (![data.stepsFinished, data.skipped].every(list => Array.isArray(list) && list.length <= 5 && list.every(step => steps.includes(step))) || !Array.isArray(data.interruptions) || data.interruptions.length > 20 || !data.interruptions.every((note: unknown) => string(note, 300))) return false;
  if (!array(data.rest, 2, r => r === null || r && number(r.samples, 1, 1000) && ['complete', 'verified', 'stable'].every(key => bool(r[key])) && array(r.mean, 2, n => number(n, -1, 1)) && ['meanRadius', 'p95', 'peak', 'jitter', 'centeredP95'].every(key => number(r[key], 0, 3)) && number(r.outsideReference, 0, 1) && nullable(r.suggestedDeadzone, .3))) return false;
  if (!array(data.sweep, 2, r => r && array(r.sectors, 24, n => nullable(n)) && number(r.covered, 0, 24) && bool(r.complete) && nullable(r.minRadius) && nullable(r.maxRadius) && nullable(r.circularityError, 100) && (r.extent === null || array(r.extent, 4, n => number(n, -1, 1))))) return false;
  if (!array(data.triggers, 2, r => r === null || r && ['rest', 'min', 'max'].every(key => nullable(r[key], 1)) && ['intermediate', 'releasedBefore', 'complete'].every(key => bool(r[key])) && number(r.cycles, 0, 40000))) return false;
  return array(data.buttons, d.buttons, b => b && number(b.index, 0, 127) && string(b.label, 100) && number(b.presses, 0, 40000) && number(b.releases, 0, 40000) && bool(b.heldAtStart) && bool(b.excluded));
}

export function readHistory(): HealthReport[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw || raw.length > 500000) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.slice(0, 10).filter(isHealthReport) : [];
  } catch { return []; }
}

export function writeHistory(reports: HealthReport[]): boolean {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(reports.slice(0, 10))); return true; }
  catch { return false; }
}
