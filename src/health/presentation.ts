import { decimal, percent, restStatus } from './reports.ts';
import { stickLabel } from './session.ts';
import type { HealthReport } from './session.ts';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

function table(title: string, headers: string[], rows: [string, string, string][]): string {
  return `<table class="health-table"><caption>${escapeHtml(title)}</caption><thead><tr><th scope="col">Measurement</th>${headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row[0])}</th><td>${escapeHtml(row[1])}</td><td>${escapeHtml(row[2])}</td></tr>`).join('')}</tbody></table>`;
}

export function measurementTables(report: HealthReport): string {
  const names = [0, 1].map(index => stickLabel(report.device, index));
  const restRow = (label: string, format: (rest: NonNullable<HealthReport['rest'][number]>) => string): [string, string, string] => [label, ...report.rest.map(rest => rest ? format(rest) : '—')] as [string, string, string];
  const sweepRow = (label: string, format: (sweep: HealthReport['sweep'][number]) => string): [string, string, string] => [label, ...report.sweep.map((sweep, index) => report.device.axes >= index * 2 + 2 ? format(sweep) : 'Not exposed')] as [string, string, string];
  const triggerRow = (label: string, format: (trigger: NonNullable<HealthReport['triggers'][number]>) => string): [string, string, string] => [label, ...report.triggers.map(trigger => trigger ? format(trigger) : 'Not identified')] as [string, string, string];
  return table('Hands off · before PadScope calibration', names, [
    ['Capture', ...report.rest.map(restStatus)] as [string, string, string],
    restRow('Observations', rest => String(rest.samples)), restRow('Mean X / Y', rest => rest.mean.map(decimal).join(' / ')),
    restRow('Mean radius', rest => percent(rest.meanRadius)), restRow('P95 radius', rest => percent(rest.p95)),
    restRow('Peak radius', rest => percent(rest.peak)), restRow('Jitter RMS', rest => percent(rest.jitter)),
    restRow('Above 5% reference', rest => percent(rest.outsideReference)),
    restRow('P95 after saved centers', rest => percent(rest.centeredP95)), restRow('Suggested deadzone', rest => percent(rest.suggestedDeadzone)),
  ]) + table('Stick edges · normalized output shape', names, [
    sweepRow('Directions recorded', sweep => `${sweep.covered}/24 · ${sweep.complete ? 'full coverage' : sweep.covered ? 'partial' : 'not tested'}`),
    sweepRow('Outer radius min / max', sweep => `${percent(sweep.minRadius)} / ${percent(sweep.maxRadius)}`),
    sweepRow('Unit-circle deviation', sweep => sweep.circularityError === null ? '—' : `${sweep.circularityError.toFixed(1)}%${sweep.complete ? '' : ' · partial outline'}`),
    sweepRow('X minimum / maximum', sweep => sweep.extent ? `${decimal(sweep.extent[0])} / ${decimal(sweep.extent[1])}` : '—'),
    sweepRow('Y minimum / maximum', sweep => sweep.extent ? `${decimal(sweep.extent[2])} / ${decimal(sweep.extent[3])}` : '—'),
  ]) + table('Trigger input · release → full pull → release', ['Left trigger', 'Right trigger'], [
    triggerRow('Capture', trigger => trigger.complete ? 'Full cycle observed' : trigger.min === null ? 'Not tested' : 'Partial travel'),
    triggerRow('Hands-off mean', trigger => percent(trigger.rest)), triggerRow('Minimum / maximum', trigger => `${percent(trigger.min)} / ${percent(trigger.max)}`),
    triggerRow('Full cycles', trigger => String(trigger.cycles)), triggerRow('Intermediate values', trigger => trigger.min === null ? 'Not tested' : trigger.intermediate ? 'Observed' : 'Not observed'),
  ]);
}

export function sweepPath(sectors: (number | null)[]): string {
  return sectors.map((radius, index) => {
    if (radius === null) return '';
    const start = (index + .07) / sectors.length * Math.PI * 2, end = (index + .93) / sectors.length * Math.PI * 2;
    const r = radius * 68;
    return `M${110 + Math.cos(start) * r},${110 + Math.sin(start) * r}A${r},${r} 0 0 1 ${110 + Math.cos(end) * r},${110 + Math.sin(end) * r}`;
  }).join(' ');
}

export function suggestedDeadzone(report: HealthReport): number | null {
  const exposed = report.rest.filter((_, index) => report.device.axes >= index * 2 + 2);
  if (!exposed.length || exposed.some(rest => rest?.suggestedDeadzone == null)) return null;
  return Math.max(...exposed.map(rest => rest!.suggestedDeadzone!));
}

export function comparisonText(current: HealthReport, saved: HealthReport): string {
  const lines: string[] = [];
  current.rest.forEach((rest, index) => {
    const before = saved.rest[index];
    if (!rest?.complete || !rest.verified || !rest.stable || !before?.complete || !before.verified || !before.stable) return;
    const difference = (rest.p95 - before.p95) * 100;
    lines.push(`${stickLabel(current.device, index)} P95: ${percent(before.p95)} → ${percent(rest.p95)} (${difference > 0 ? '+' : ''}${difference.toFixed(1)} percentage points).`);
  });
  return lines.length ? `${lines.join(' ')} Lower means less observed resting input in this pair of checks.` : 'Both checks need a complete, verified, stable hands-off window for a resting-input comparison.';
}
