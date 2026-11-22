import { element, text, tag } from '../ui.ts';
import type { Settings } from '../controller/calibration.ts';
import { HealthSession, comparableReports, steps, stickLabel } from './session.ts';
import type { HealthInput, HealthReport, HealthStep } from './session.ts';
import { decimal, percent, readHistory, reportText, writeHistory } from './reports.ts';
import { comparisonText, escapeHtml, measurementTables, suggestedDeadzone, sweepPath } from './presentation.ts';
import { RecordedConnection } from './connection.ts';

const instructions: Record<HealthStep, [string, string]> = {
  prepare: ['Warm up the inputs', 'Move each stick up, down, left, and right, then release both. This verifies that all four axes respond before the hands-off capture.'],
  rest: ['Keep your hands off', 'Set the controller on a steady surface and release sticks and triggers. Keep this page focused for five uninterrupted seconds.'],
  sweep: ['Sweep both stick edges', 'Push each stick to its outer edge and slowly rotate it all the way around. Keep pressure against the edge; fill all 24 directions on both plots.'],
  triggers: ['Pull and release the triggers', 'Start with both triggers released. Slowly pull each fully, then release it. Repeat if you want. Use the full-travel setting if your controller has trigger stops.'],
  buttons: ['Press and release each button', 'Press each exposed button once and release it. Include shoulders, stick clicks, D-pad directions, and trigger buttons. The ledger below records fresh press/release pairs.'],
};

export class ControllerCheck {
  private session: HealthSession | null = null;
  private viewed: HealthReport | null = null;
  private history = readHistory();
  private latest: HealthInput = { device: null, axes: [0, 0, 0, 0], buttons: [], timestamp: 0, active: false, preview: false };
  private body = element('health-body');
  private connection = element<HTMLSelectElement>('health-connection');
  private recordedConnection = new RecordedConnection();
  private notes = element<HTMLTextAreaElement>('health-notes');
  private lastRender = 0;
  private tableHtml = '';
  private buttonSignature = '';
  private buttons: { row: HTMLElement; state: HTMLElement; checkbox: HTMLInputElement }[] = [];
  private feedback = '';
  private getSettings: () => Settings;
  private applyDeadzone: (value: number, report: HealthReport) => boolean;

  constructor(getSettings: () => Settings, applyDeadzone: (value: number, report: HealthReport) => boolean) {
    this.getSettings = getSettings; this.applyDeadzone = applyDeadzone;
    element('health-toggle').addEventListener('click', () => this.setOpen(this.body.hidden));
    document.querySelectorAll<HTMLAnchorElement>('a[href="#health-check"]').forEach(link => link.addEventListener('click', () => this.setOpen(true)));
    window.addEventListener('hashchange', () => { if (location.hash === '#health-check') this.setOpen(true); });
    element('health-start').addEventListener('click', () => this.start());
    element('health-next').addEventListener('click', () => { this.feedback = ''; this.session?.next(); this.refresh(); });
    element('health-skip').addEventListener('click', () => { this.feedback = ''; this.session?.next(true); this.refresh(); });
    element('health-repeat').addEventListener('click', () => { this.feedback = ''; this.session?.repeat(); this.refresh(); });
    element('health-stop').addEventListener('click', () => { this.feedback = ''; this.session?.stop(); this.refresh(); });
    element('health-pause').addEventListener('click', () => {
      this.feedback = '';
      if (this.session?.status === 'paused') {
        if (!document.hasFocus() || !this.latest.active || !this.session.resume(this.latest.device)) this.feedback = 'Reconnect the original input source, focus this page, and try Resume again.';
      } else this.session?.pause();
      this.refresh();
    });
    this.connection.addEventListener('change', () => { this.recordedConnection.remember(this.latest.device, this.connection.value); this.latest.device = this.recordedConnection.forDevice(this.latest.device); this.refresh(); });
    this.notes.addEventListener('input', () => this.renderReport());
    element('health-save').addEventListener('click', () => this.save());
    element('health-clear-history').addEventListener('click', () => {
      if (writeHistory([])) { this.history = []; this.viewed = null; this.feedback = 'Saved checks cleared from this browser.'; this.renderHistory(); }
      else this.feedback = 'Browser storage is unavailable. Saved checks could not be cleared.';
      this.refresh();
    });
    element('health-compare').addEventListener('change', () => this.renderComparison());
    element('health-export-json').addEventListener('click', () => this.download('json'));
    element('health-export-text').addEventListener('click', () => this.download('txt'));
    element('health-print').addEventListener('click', () => {
      document.body.classList.add('print-health');
      window.addEventListener('afterprint', () => document.body.classList.remove('print-health'), { once: true });
      try { window.print(); }
      catch { document.body.classList.remove('print-health'); this.feedback = 'Printing is unavailable. Download the text or JSON report.'; this.refresh(); }
    });
    element('health-apply-deadzone').addEventListener('click', () => {
      const report = this.currentReport(), value = report ? suggestedDeadzone(report) : null;
      if (report && value !== null && this.applyDeadzone(value, report)) this.feedback = `${percent(value)} radial deadzone applied to this controller in PadScope. Raw check measurements are preserved.`;
      else this.feedback = 'Use the same live controller and saved stick centers to apply this suggestion. Start a new check if the source or calibration changed.';
      this.refresh();
    });
    window.addEventListener('blur', () => this.pause('Page lost focus. Focus PadScope, then resume the check.'));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause('Page hidden. Return to PadScope, then resume the check.'); });
    window.addEventListener('pagehide', () => this.pause('Page closed or left.'));
    this.renderHistory();
    if (location.hash === '#health-check') this.setOpen(true);
  }

  update(now: number, input: HealthInput): void {
    const device = this.recordedConnection.forDevice(input.device);
    this.latest = { ...input, device };
    const previousStatus = this.session?.status;
    if (document.hasFocus() && !document.hidden && !this.body.hidden) this.session?.update(now, this.latest);
    else this.session?.pause('Capture paused. Open the check and focus PadScope to resume.');
    if (previousStatus !== this.session?.status) this.feedback = '';
    if (!this.body.hidden && now - this.lastRender >= 100) { this.lastRender = now; this.render(); }
  }

  private setOpen(open: boolean): void {
    this.body.hidden = !open;
    element('health-toggle').setAttribute('aria-expanded', String(open));
    text('health-toggle', open ? 'Close controller check' : 'Open controller check');
    if (!open) this.pause('Check closed. Open it and resume when ready.');
    else this.render();
  }

  private start(): void {
    if (!this.latest.device || !this.latest.active || this.latest.preview || this.session && this.session.status !== 'finished') return;
    this.session = new HealthSession(this.latest.device, this.getSettings());
    this.viewed = null; this.feedback = ''; this.renderHistory(); this.render();
  }

  private pause(reason: string): void { if (this.session?.status === 'running') this.feedback = ''; this.session?.pause(reason); if (!this.body.hidden) this.render(); }
  private refresh(): void { this.render(); }
  private currentReport(): HealthReport | null { return this.viewed ?? this.session?.report(navigator.userAgent, this.notes.value) ?? null; }

  private render(): void {
    const session = this.session, running = session?.status === 'running', unfinished = Boolean(session && session.status !== 'finished');
    const device = this.latest.device;
    text('health-device', this.latest.preview ? 'Exit preview and connect a real controller to begin.' : device ? `${device.name} · ${device.axes} axes / ${device.buttons} exposed buttons` : 'Connect a controller and press a button to begin.');
    tag('health-source', this.latest.preview ? 'Preview · not testable' : device ? `${device.api === 'hid' ? 'HID' : 'Gamepad'} · ${device.mapping === 'unmapped' ? 'raw indices' : 'mapped inputs'}` : 'Live input required', device ? 'ready' : '');
    this.connection.value = device?.connection ?? 'not recorded';
    this.connection.disabled = unfinished || device?.api === 'hid';
    this.notes.disabled = this.viewed !== null;
    element<HTMLButtonElement>('health-start').disabled = unfinished || !device || !this.latest.active || this.latest.preview;
    text('health-start', session ? 'Start new check' : 'Start check');
    for (const name of ['next', 'repeat', 'skip']) element<HTMLButtonElement>(`health-${name}`).disabled = !running || this.viewed !== null || name === 'next' && !session?.ready;
    element<HTMLButtonElement>('health-pause').disabled = !unfinished;
    element<HTMLButtonElement>('health-stop').disabled = !unfinished;
    text('health-pause', session?.status === 'paused' ? 'Resume' : 'Pause');
    text('health-next', session?.step === 'buttons' ? 'Finish check' : 'Next step');
    const finishedSteps = this.currentReport()?.stepsFinished ?? [];
    document.querySelectorAll<HTMLElement>('#health-steps li').forEach(li => {
      const step = li.dataset.step as HealthStep;
      li.toggleAttribute('aria-current', false);
      if (unfinished && session?.step === step) li.setAttribute('aria-current', 'step');
      li.dataset.finished = String(finishedSteps.includes(step));
    });
    const title = this.viewed ? 'Saved check' : session?.status === 'finished' ? 'Review your check' : session ? instructions[session.step][0] : 'Ready when you are';
    text('health-step-title', title);
    text('health-instruction', this.viewed ? 'This report is saved locally. Start a new check to take fresh measurements.' : session?.status === 'finished' ? 'Review coverage as well as the numbers. Save or export this check before starting another.' : session ? instructions[session.step][1] : 'Use a live controller. The check records input before PadScope’s center correction and deadzone.');
    element<HTMLProgressElement>('health-progress').value = session?.step === 'rest' ? session.restProgress : 0;
    element('health-progress').hidden = session?.step !== 'rest' || this.viewed !== null;
    text('health-progress-label', this.viewed ? 'Saved measurements' : session?.step === 'rest' ? `${(session.restProgress * 5).toFixed(1)} / 5.0 seconds${session.restComplete ? ' · captured' : ''}` : session && unfinished ? `Step ${steps.indexOf(session.step) + 1} of 5${session.ready ? ' · ready to continue' : ''}` : 'Five guided steps');
    text('health-message', this.feedback || session?.message || (running ? 'Capture active · keep this page focused.' : 'Preview inputs cannot produce a controller check.'));
    this.renderReport();
    this.renderPlots();
    this.historyButtonsDisabled(unfinished);
  }

  private renderReport(): void {
    const report = this.currentReport();
    element('health-results').hidden = !report;
    for (const name of ['save', 'export-json', 'export-text', 'print']) element<HTMLButtonElement>(`health-${name}`).disabled = !report || !this.viewed && this.session?.status !== 'finished';
    if (!report) { text('health-step-detail', 'The dashed ring is normalized radius 1. Colored arcs show each recorded sector’s furthest input.'); return; }
    const context = `${report.device.name} · ${new Date(report.createdAt).toLocaleString()} · ${report.device.api.toUpperCase()} / ${report.device.connection} / ${report.device.mapping}. ${report.sampling.observations} browser observations, ${(report.sampling.activeMs / 1000).toFixed(1)}s active.${report.notes ? ` Notes: ${report.notes}` : ''}`;
    text('health-report-context', context);
    text('health-report-conditions', `Browser: ${report.browser}. Centers at start: ${report.calibration.centers.map(decimal).join(' / ')}; deadzone ${percent(report.calibration.deadzone)}. These are browser-visible observations before PadScope calibration, not hardware latency or a manufacturer pass/fail test.`);
    text('health-report-interruptions', `Finished steps: ${report.stepsFinished.join(', ') || 'none'}. Skipped: ${report.skipped.join(', ') || 'none'}. Interruptions: ${report.interruptions.join(' ') || 'none'}.`);
    const complete = report.stepsFinished.length === steps.length;
    tag('health-report-state', this.viewed ? 'Saved check' : complete ? 'All steps finished' : this.session?.status === 'finished' ? 'Partial check' : 'Capture in progress', complete ? 'ready' : '');
    const html = measurementTables(report);
    if (html !== this.tableHtml) { this.tableHtml = html; element('health-tables').innerHTML = html; }
    this.renderButtons(report);
    const suggestion = suggestedDeadzone(report);
    text('health-recommendation', suggestion === null ? 'A deadzone suggestion needs a full, stable hands-off window and verified stick axes. Repeat the check hands off if input moved. The result affects only PadScope.' : `Measured suggestion: ${percent(suggestion)} radial deadzone, using P95 after your saved center correction plus a 1 percentage-point margin, rounded up. Review the raw readings first. This changes PadScope’s model and aiming only.`);
    const settings = this.getSettings();
    element<HTMLButtonElement>('health-apply-deadzone').disabled = suggestion === null || this.session?.status === 'running' || this.session?.status === 'paused' || !this.latest.active || this.latest.preview || this.latest.device?.source !== report.device.source || !settings.centers.every((center, index) => center === report.calibration.centers[index]);
    const session = this.session;
    if (this.viewed || session?.status === 'finished') text('health-step-detail', `Finished: ${report.stepsFinished.join(', ') || 'none'}. Skipped: ${report.skipped.join(', ') || 'none'}. Interruptions: ${report.interruptions.length}. Unit-circle deviation describes output shape, not a fault threshold.`);
    else if (session?.step === 'prepare') text('health-step-detail', report.device.axes < 2 ? 'No stick pairs are exposed. Continue to the available checks.' : session.supportedSticks.map((supported, index) => supported ? `${stickLabel(report.device, index)}: X ${session.activated[index * 2] ? 'verified' : 'move and release'}, Y ${session.activated[index * 2 + 1] ? 'verified' : 'move and release'}` : `${stickLabel(report.device, index)}: not exposed`).join(' · '));
    else if (session?.step === 'sweep') text('health-step-detail', report.sweep.map((sweep, index) => `${stickLabel(report.device, index)}: ${sweep.covered}/24 directions`).join(' · '));
    else if (session?.step === 'triggers') text('health-step-detail', report.triggers.every(trigger => trigger === null) ? 'Trigger positions cannot be identified on this input mapping. Continue to the button-index check.' : report.triggers.map((trigger, index) => `${index ? 'Right' : 'Left'}: ${trigger ? `${trigger.cycles} full cycles · live ${percent(this.latest.buttons[index + 6] ?? null)}` : 'not identified'}`).join(' · '));
    else if (session?.step === 'buttons') text('health-step-detail', `${report.buttons.filter(button => button.presses > 0 && button.releases > 0 && !button.excluded).length} press/release pairs · ${report.buttons.filter(button => button.excluded).length} marked unavailable · ${report.buttons.filter(button => !button.excluded && (!button.presses || !button.releases)).length} remaining. Scroll to the ledger to see each button.`);
    else text('health-step-detail', session?.restComplete ? 'Five-second window captured. You can continue or repeat this step if you touched an input.' : 'Capture stops on focus loss or a sampling gap. Resume restarts an incomplete five-second window.');
    this.renderComparison();
  }

  private renderButtons(report: HealthReport): void {
    const signature = `${report.device.mapping}:${report.buttons.map(button => `${button.index}:${button.label}`).join('|')}`;
    if (signature !== this.buttonSignature) {
      this.buttonSignature = signature;
      const container = element('health-buttons'); container.replaceChildren();
      this.buttons = report.buttons.map(button => {
        const row = document.createElement('div'); row.className = 'health-button-entry';
        row.innerHTML = `<strong>${escapeHtml(button.label)} <span class="mono">[${button.index}]</span></strong><p></p><label><input type="checkbox" /> Unavailable on this controller</label>`;
        const checkbox = row.querySelector('input')!;
        checkbox.setAttribute('aria-label', `Mark ${button.label} unavailable on this controller`);
        checkbox.addEventListener('change', () => { this.session?.excludeButton(button.index, checkbox.checked); this.feedback = ''; this.renderReport(); });
        container.append(row);
        return { row, state: row.querySelector('p')!, checkbox };
      });
    }
    report.buttons.forEach((button, index) => {
      const entry = this.buttons[index], tested = button.presses > 0 && button.releases > 0;
      entry.row.dataset.tested = String(tested && !button.excluded);
      entry.state.textContent = button.excluded ? 'Marked unavailable by you' : `${tested ? 'Press + release observed' : 'Not fully tested'} · ${button.presses}/${button.releases}${button.heldAtStart ? ' · held at start/resume' : ''}`;
      entry.checkbox.checked = button.excluded;
      entry.checkbox.disabled = this.viewed !== null || this.session?.status !== 'running' || this.session?.step !== 'buttons';
    });
  }

  private renderPlots(): void {
    const report = this.currentReport(), device = report?.device ?? this.latest.device;
    ['left', 'right'].forEach((side, index) => {
      text(`health-${side}-label`, device ? stickLabel(device, index) : index ? 'Right stick' : 'Left stick');
      const showLive = !this.viewed && this.latest.active && !this.latest.preview && Boolean(device && device.axes >= index * 2 + 2 && (!report || this.latest.device?.source === report.device.source));
      const x = this.latest.axes[index * 2], y = this.latest.axes[index * 2 + 1];
      const dot = element(`health-${side}-dot`);
      dot.toggleAttribute('hidden', !showLive);
      if (showLive) { dot.setAttribute('cx', String(110 + x * 68)); dot.setAttribute('cy', String(110 + y * 68)); }
      element(`health-${side}-sweep`).setAttribute('d', report ? sweepPath(report.sweep[index].sectors) : '');
      text(`health-${side}-live`, showLive ? `X ${decimal(x)} / Y ${decimal(y)}` : this.viewed ? 'Saved outer-direction coverage' : 'Raw input —');
    });
  }

  private save(): void {
    const report = this.currentReport(); if (!report) return;
    const history = [report, ...this.history.filter(saved => saved.createdAt !== report.createdAt)].slice(0, 10);
    if (writeHistory(history)) { this.history = history; this.feedback = 'Check saved in this browser. Download a copy to keep it outside this device.'; this.renderHistory(); }
    else this.feedback = 'Browser storage is unavailable. Download the report to keep it.';
    this.refresh();
  }

  private historyButtonsDisabled(disabled: boolean): void {
    element<HTMLButtonElement>('health-clear-history').disabled = disabled || !this.history.length;
    element('health-history-list').querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = disabled; });
  }

  private renderHistory(): void {
    const container = element('health-history-list'); container.replaceChildren();
    if (this.session) {
      const current = document.createElement('button'); current.type = 'button'; current.className = 'button secondary'; current.textContent = 'Latest check';
      current.setAttribute('aria-pressed', String(!this.viewed));
      current.addEventListener('click', () => { this.viewed = null; this.feedback = ''; this.renderHistory(); this.refresh(); }); container.append(current);
    }
    const select = element<HTMLSelectElement>('health-compare'), selected = select.value;
    select.replaceChildren(new Option('Choose a saved check', ''));
    this.history.forEach(report => {
      const label = `${new Date(report.createdAt).toLocaleString()} · ${report.device.name}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = label;
      button.setAttribute('aria-pressed', String(this.viewed === report));
      button.addEventListener('click', () => { this.viewed = report; this.feedback = ''; this.renderHistory(); this.refresh(); });
      container.append(button); select.add(new Option(label, report.createdAt));
    });
    select.value = selected;
    text('health-history-status', this.history.length ? `${this.history.length}/10 saved in this browser. Clearing site data removes them; downloaded copies are independent.` : 'Save up to ten checks in this browser. Reports stay on this device.');
    this.historyButtonsDisabled(Boolean(this.session && this.session.status !== 'finished'));
  }

  private renderComparison(): void {
    const value = element<HTMLSelectElement>('health-compare').value, current = this.currentReport(), saved = this.history.find(report => report.createdAt === value);
    text('health-comparison', !current || !saved ? '' : current.createdAt === saved.createdAt ? 'Choose a different saved check to compare.' : !comparableReports(current, saved) ? 'Use matching conditions and record both connections: device identifier, input API/mapping, connection, browser, and saved stick centers. Firmware and profiles should also match; record them in your notes.' : comparisonText(current, saved));
  }

  private download(format: 'json' | 'txt'): void {
    const report = this.currentReport(); if (!report) return;
    const url = URL.createObjectURL(new Blob([format === 'json' ? JSON.stringify(report, null, 2) : reportText(report)], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `padscope-check-${report.createdAt.replace(/[:.]/g, '-')}.${format}`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.feedback = `${format === 'json' ? 'JSON' : 'Text'} check report downloaded.`; this.refresh();
  }
}
