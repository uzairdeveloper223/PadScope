import { RangeAim, defaultRangeSettings, restoreRangeSettings } from './aim.ts';
import type { RangeSettings } from './aim.ts';
import { ButtonEdges } from './input.ts';
import { RangeRound } from './round.ts';
import { RangeView } from './view.ts';
import { buttonNames } from '../controller/state.ts';
import type { Axes, Rotation, Vector3 } from '../controller/state.ts';
import type { ControllerReplica } from '../model.ts';
import { element, tag, text } from '../ui.ts';
import type { WorkbenchAudio } from '../audio.ts';

export interface RangeInput {
  axes: Axes;
  buttons: number[];
  pose: Rotation;
  accel: Vector3 | null;
  gyroAvailable: boolean;
  active: boolean;
  preview: boolean;
  generic: boolean;
  source: string;
}
type Binding = 'fire' | 'recenter' | 'pause';

export class TargetRange {
  private aim = new RangeAim();
  private round = new RangeRound();
  private edges = new ButtonEdges();
  private settings = defaultRangeSettings();
  private view: RangeView | null = null;
  private input: RangeInput | null = null;
  private opened = false;
  private loading = false;
  private previousTime: number | null = null;
  private lastUI = 0;
  private lastShot = -Infinity;
  private keys = new Set<string>();
  private binding: Binding | null = null;
  private bindArmed = false;
  private bindTimer = 0;
  private feedbackTimer = 0;
  private optionSignature = '';
  private pauseReason = '';
  private focused = true;
  private rearmButtons = true;

  constructor(private replica: () => ControllerReplica | null, private audio?: WorkbenchAudio) {
    try { this.settings = restoreRangeSettings(JSON.parse(localStorage.getItem('padscope:range') ?? 'null')); } catch { /* Session defaults. */ }
    this.bindEvents(); this.populateMappings(18, false); this.syncSettings(); this.updateUI();
  }

  private bindEvents(): void {
    element('range-toggle').addEventListener('click', () => void this.toggle());
    element('range-start').addEventListener('click', () => this.start());
    element('range-pause').addEventListener('click', () => this.togglePause());
    element('range-center').addEventListener('click', () => this.center());
    element('range-fire').addEventListener('click', () => this.fire());
    element('range-settings').addEventListener('change', event => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (target.id === 'range-mode') {
        this.settings.mode = target.value as RangeSettings['mode']; this.invalidateGrip();
      } else if (target.id === 'range-stick') this.settings.stick = target.value as RangeSettings['stick'];
      else if (target.id === 'range-weapon') this.settings.weapon = target.value as RangeSettings['weapon'];
      else if (target.id === 'range-invert-x') this.settings.invertX = (target as HTMLInputElement).checked;
      else if (target.id === 'range-invert-y') this.settings.invertY = (target as HTMLInputElement).checked;
      else if (target.dataset.binding) this.assign(target.dataset.binding as Binding, Number(target.value));
      this.persist(); this.syncSettings(); this.updateUI();
    });
    element('range-sensitivity').addEventListener('input', event => {
      this.settings.sensitivity = Number((event.target as HTMLInputElement).value) / 100;
      text('range-sensitivity-value', `${this.settings.sensitivity.toFixed(2)}×`); this.persist();
    });
    document.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(button => button.addEventListener('click', () => {
      if (this.binding === button.dataset.bind) { this.cancelBinding(); return; }
      this.cancelBinding(); this.round.pause(); this.binding = button.dataset.bind as Binding;
      this.bindArmed = false;
      this.message(`Release all buttons, then press the control for ${this.binding === 'recenter' ? 'center grip' : this.binding}.`);
      this.bindTimer = window.setTimeout(() => { this.cancelBinding(); this.message('No button received. Try again with a connected controller.'); }, 10000);
      this.syncSettings(); this.updateUI();
    }));
    element('range-reset-settings').addEventListener('click', () => {
      this.cancelBinding(); this.settings = defaultRangeSettings(); this.invalidateGrip();
      this.persist(); this.syncSettings(); this.message('Range controls reset.'); this.updateUI();
    });
    const stage = element('range-stage');
    const point = (event: PointerEvent) => {
      if (this.settings.mode !== 'stick' || !this.view?.ready) return;
      const bounds = stage.getBoundingClientRect();
      this.aim.cursor.set(Math.max(-.96, Math.min(.96, (event.clientX - bounds.left) / bounds.width * 2 - 1)), Math.max(-.96, Math.min(.96, 1 - (event.clientY - bounds.top) / bounds.height * 2)));
      this.aim.inside = true;
    };
    stage.addEventListener('pointermove', point);
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      stage.focus({ preventScroll: true }); point(event);
      this.fire();
    });
    stage.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'c', 'p', 'escape'].includes(key)) event.preventDefault();
      if (event.repeat) return;
      this.keys.add(key);
      if (key === ' ') this.fire();
      if (key === 'c') this.center();
      if (key === 'p' || key === 'escape') this.togglePause();
    });
    document.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.binding) this.cancelBinding(); });
    stage.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.rearmButtons = true; this.pause('Page hidden. Resume when you are ready.'); } });
    window.addEventListener('blur', () => { this.focused = false; this.rearmButtons = true; this.keys.clear(); this.pause('Page lost focus. Resume when you are ready.'); });
    window.addEventListener('focus', () => { this.focused = true; this.updateUI(); });
    element('range-fullscreen').hidden = !document.fullscreenEnabled;
    element('range-fullscreen').addEventListener('click', () => void this.fullscreen());
  }

  private async toggle(): Promise<void> {
    this.opened = !this.opened;
    element('range-body').hidden = !this.opened;
    element('range-toggle').setAttribute('aria-expanded', String(this.opened));
    text('range-toggle', this.opened ? 'Close range' : 'Open target range');
    if (this.opened) this.audio?.unlock('range');
    else this.audio?.setActive('range', false);
    this.previousTime = null;
    this.rearmButtons = true;
    if (!this.opened) { this.cancelBinding(); this.pause('Range closed. Resume when you are ready.'); return; }
    this.edges.seed(this.input?.preview ? [] : this.input?.buttons ?? []);
    if (this.view?.ready || this.loading) { this.updateUI(); return; }
    this.loading = true;
    try {
      this.view ??= new RangeView(element('range-stage'), element('range-loading'));
      await this.view.load();
      this.message('Targets ready. Choose your aiming mode, then start the round.');
    } catch { this.message('The range could not open. Close and reopen it to retry; check that hardware acceleration is enabled.'); }
    finally { this.loading = false; this.updateUI(); }
  }

  update(time: number, input: RangeInput): void {
    const prior = this.input;
    this.input = input;
    if (prior && input.source !== prior.source) {
      this.pause('Controller input changed. Check the controls before resuming.');
      this.cancelBinding(); this.invalidateGrip(); this.edges.seed(input.preview ? [] : input.buttons);
    }
    this.audio?.setActive('range', Boolean(this.opened && this.view?.ready && this.view.visible && !this.view.lost));
    if (!this.opened || !this.view) return;
    const dt = this.previousTime === null ? 0 : Math.max(0, (time - this.previousTime) / 1000);
    this.previousTime = time;
    if (dt > .25) this.pause('Updates paused. Resume when you are ready.');
    if (!this.view.visible) this.pause('Range out of view. Resume when you are ready.');
    if (this.view.lost) this.pause('Range graphics paused. Reload to restore the game.');
    if (this.settings.mode === 'gyro' && !input.gyroAvailable) {
      this.pause('Motion data unavailable. Reconnect hardware and center your grip.');
      this.aim.clearGrip();
    }
    const interactive = this.canInteract();
    if (!interactive) this.rearmButtons = true;
    else if (this.rearmButtons) {
      // Baseline the first live report after returning, not the cached pre-hide input.
      this.edges.seed(input.preview ? [] : input.buttons); this.rearmButtons = false;
    }
    const pressed = this.edges.update(input.preview ? [] : input.buttons);
    if (interactive && this.binding) this.readBinding(pressed);
    else if (interactive) {
      if (pressed.includes(this.settings.pause)) this.togglePause();
      if (pressed.includes(this.settings.recenter)) this.center();
    }
    const step = dt <= .25 ? dt : 0;
    if (this.settings.mode === 'gyro') this.aim.updateGyro(input.pose, this.settings, this.view.camera.aspect, this.view.camera.fov);
    else {
      const axes: Axes = input.active && !input.preview ? [...input.axes] : [0, 0, 0, 0];
      const keyboardX = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
      const keyboardY = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
      if (keyboardX || keyboardY) { const offset = this.settings.stick === 'left' ? 0 : 2; axes[offset] = keyboardX * .7; axes[offset + 1] = keyboardY * .7; }
      this.aim.updateStick(axes, step, this.settings, this.view.camera.aspect);
    }
    const wasRunning = this.round.status === 'running';
    this.round.advance(step);
    this.view.advance(this.round.status === 'running' ? step : 0, this.round.elapsed);
    if (interactive && !this.binding && pressed.includes(this.settings.fire)) this.fire();
    if (wasRunning && this.round.status === 'finished') this.finish();
    if (!this.view.hasReplica) { const replica = this.replica(); if (replica) this.view.setReplica(replica); }
    const reticle = element('range-reticle');
    reticle.style.left = `${(this.aim.cursor.x + 1) * 50}%`;
    reticle.style.top = `${(1 - this.aim.cursor.y) * 50}%`;
    reticle.classList.toggle('off-target', !this.aim.inside);
    reticle.hidden = !this.view.ready;
    element('range-edge-hint').hidden = this.settings.mode !== 'gyro' || !this.aim.centered || this.aim.inside;
    this.view.render(this.aim.cursor, this.aim.weapon, this.aim.gunPose, this.settings.mode === 'gyro', this.aim.inside, step, this.settings.weapon);
    if (time - this.lastUI >= 100) { this.lastUI = time; this.updateUI(); }
  }

  private start(): void {
    if (!this.canStart()) return;
    this.cancelBinding(); this.round.start(); this.view!.reset(); this.lastShot = -Infinity;
    this.audio?.roundStart();
    this.edges.seed(this.input?.preview ? [] : this.input?.buttons ?? []);
    this.previousTime = null;
    this.message(`Round started. ${this.settings.mode === 'gyro' ? 'Aim with your controller.' : 'Aim with the selected stick, pointer, or arrow keys.'}`);
    element('range-stage').focus({ preventScroll: true }); this.updateUI();
  }

  private canInteract(): boolean { return Boolean(this.opened && this.focused && !document.hidden && this.view?.ready && this.view.visible && !this.view.lost); }
  private canStart(): boolean { return Boolean(this.canInteract() && !this.binding && (this.settings.mode === 'stick' || this.input?.gyroAvailable && this.aim.centered)); }

  private togglePause(): void {
    if (this.round.status === 'running') this.pause('Round paused.');
    else if (this.round.status === 'paused' && this.canStart()) {
      this.round.resume(); this.edges.seed(this.input?.preview ? [] : this.input?.buttons ?? []);
      this.previousTime = null; this.message('Round resumed.'); this.updateUI();
    }
  }

  private pause(reason: string): void {
    this.keys.clear();
    if (this.round.status !== 'running') return;
    this.round.pause(); this.pauseReason = reason; this.message(reason); this.updateUI();
  }

  invalidateGrip(message?: string): void {
    this.aim.clearGrip();
    if (this.settings.mode === 'gyro') this.pause(message ?? 'Center your grip before resuming gyro aiming.');
    if (message) this.message(message);
  }

  private center(): void {
    if (!this.canInteract() || this.binding) return;
    if (this.settings.mode === 'stick') { this.aim.centerStick(); this.message('Aim centered.'); }
    else if (!this.input?.gyroAvailable || !this.input.accel) this.message('Gyro aiming needs live motion data. Connect hardware in desktop Chrome or Edge.');
    else if (this.aim.captureGrip(this.input.pose, this.input.accel)) this.message('Grip centered. Keep this sideways grip and aim with the left handle.');
    else this.message('Hold still with the left handle pointing at the screen, then center again.');
    this.updateUI();
  }

  private fire(): void {
    if (this.round.status !== 'running' || !this.canInteract() || !this.aim.inside || this.binding) return;
    const now = performance.now();
    if (now - this.lastShot < 160) return;
    this.lastShot = now;
    const hit = this.view!.shoot(this.aim.cursor);
    this.audio?.shot(this.settings.weapon, hit.hit, hit.bullseye);
    const points = this.round.shoot(hit.hit, hit.bullseye, hit.small);
    element('range-reticle').dataset.hit = hit.hit ? 'yes' : 'no';
    text('range-shot-feedback', hit.hit ? `${hit.bullseye ? 'Bullseye' : 'Hit'} +${points}` : 'Miss');
    window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => { delete element('range-reticle').dataset.hit; text('range-shot-feedback', ''); }, 650);
    this.updateUI();
  }

  private finish(): void {
    this.audio?.roundComplete();
    this.message(`Round complete: ${this.round.score} points, ${this.round.hits} hits from ${this.round.shots} shots, ${this.round.accuracy}% accuracy.`);
    this.updateUI();
  }

  private assign(action: Binding, index: number): void {
    const other = (['fire', 'recenter', 'pause'] as Binding[]).find(key => key !== action && this.settings[key] === index);
    if (other) this.settings[other] = this.settings[action];
    this.settings[action] = index;
    this.edges.seed(this.input?.preview ? [] : this.input?.buttons ?? []);
  }

  private readBinding(pressed: number[]): void {
    if (!this.input?.active || this.input.preview) return;
    if (!this.bindArmed) { if (this.input.buttons.every(value => value <= .25)) this.bindArmed = true; return; }
    const index = pressed.find(value => value < 64);
    if (index === undefined) return;
    const action = this.binding!;
    this.assign(action, index); this.cancelBinding(); this.persist(); this.syncSettings();
    this.message(`${action === 'recenter' ? 'Center grip' : action === 'fire' ? 'Fire' : 'Pause'} mapped to ${this.buttonLabel(index)}.`);
  }

  private cancelBinding(): void {
    window.clearTimeout(this.bindTimer); this.binding = null; this.bindArmed = false; this.syncSettings();
  }

  private buttonLabel(index: number): string { return this.input?.generic ? `Button ${index}` : buttonNames[index] ?? `Button ${index}`; }

  private populateMappings(count: number, generic: boolean): void {
    const max = Math.max(count, this.settings.fire + 1, this.settings.recenter + 1, this.settings.pause + 1);
    const signature = `${max}:${generic}`;
    if (signature === this.optionSignature) return;
    this.optionSignature = signature;
    for (const action of ['fire', 'recenter', 'pause'] as const) {
      const select = element<HTMLSelectElement>(`range-map-${action}`); select.replaceChildren();
      for (let index = 0; index < max; index++) select.add(new Option(generic ? `Button ${index}` : buttonNames[index] ?? `Button ${index}`, String(index)));
    }
    this.syncSettings();
  }

  private persist(): void {
    try { localStorage.setItem('padscope:range', JSON.stringify(this.settings)); }
    catch { this.message('Controls apply this session. Browser storage is unavailable.'); }
  }

  private syncSettings(): void {
    element<HTMLSelectElement>('range-mode').value = this.settings.mode;
    element<HTMLSelectElement>('range-stick').value = this.settings.stick;
    element<HTMLSelectElement>('range-weapon').value = this.settings.weapon;
    element<HTMLInputElement>('range-sensitivity').value = String(Math.round(this.settings.sensitivity * 100));
    text('range-sensitivity-value', `${this.settings.sensitivity.toFixed(2)}×`);
    element<HTMLInputElement>('range-invert-x').checked = this.settings.invertX;
    element<HTMLInputElement>('range-invert-y').checked = this.settings.invertY;
    for (const action of ['fire', 'recenter', 'pause'] as const) {
      element<HTMLSelectElement>(`range-map-${action}`).value = String(this.settings[action]);
      const button = document.querySelector<HTMLButtonElement>(`[data-bind="${action}"]`)!;
      button.textContent = this.binding === action ? 'Cancel' : 'Bind press';
      button.setAttribute('aria-pressed', String(this.binding === action));
    }
  }

  private updateUI(): void {
    const gyro = this.settings.mode === 'gyro';
    const running = this.round.status === 'running', paused = this.round.status === 'paused';
    const input = this.input;
    this.populateMappings(Math.min(64, input?.buttons.length || 18), input?.generic ?? false);
    element<HTMLOptionElement>('range-gyro-option').disabled = !input?.gyroAvailable;
    element('range-stick-field').hidden = gyro;
    element('range-grip-help').hidden = !gyro;
    element<HTMLButtonElement>('range-center').disabled = !this.canInteract() || gyro && !input?.gyroAvailable || this.binding !== null;
    element<HTMLButtonElement>('range-start').disabled = !this.canStart() || running;
    text('range-start', this.round.status === 'idle' ? 'Start 60-second round' : 'New round');
    element<HTMLButtonElement>('range-pause').disabled = !running && !(paused && this.canStart());
    text('range-pause', paused ? 'Resume' : 'Pause');
    element<HTMLButtonElement>('range-fire').disabled = !this.canInteract() || !running || !this.aim.inside || this.binding !== null;
    element<HTMLFieldSetElement>('range-settings').disabled = running;
    document.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(button => { button.disabled = button.dataset.bind !== this.binding && (!input?.active || input.preview); });
    text('range-center', gyro ? 'Center grip' : 'Center aim');
    text('range-time', `${Math.ceil(this.round.remaining)}s`);
    text('range-score', String(this.round.score)); text('range-accuracy', `${this.round.accuracy}%`);
    text('range-streak', String(this.round.streak)); text('range-hits', `${this.round.hits}/${this.round.shots}`);
    tag('range-input-tag', input?.preview ? 'Preview · pointer / keys' : input?.gyroAvailable ? 'Live controller + gyro' : input?.active ? 'Live controller' : 'Pointer / keyboard', input?.preview ? 'preview' : input?.active ? 'ready' : '');
    const hint = gyro ? !input?.gyroAvailable ? 'Connect hardware for live motion, or choose joystick aiming.' : !this.aim.centered ? 'Hold the grip shown below and select Center grip.' : 'Grip ready. Recenter whenever your aim needs lining up.' : `Use the ${this.settings.stick} stick. You can also point and click, or use arrow keys and Space.`;
    text('range-aim-help', hint);
    text('range-keyboard-help', gyro ? 'Move the controller to aim. Fire with the mapped button, a click / tap, or Space. C centers and P pauses when the range is focused.' : 'Click or tap to aim and fire. Keyboard: arrows / WASD to aim, Space to fire, C to center, P to pause. Focus the range first.');
    const overlay = element('range-overlay'); overlay.hidden = running || !this.view?.ready;
    text('range-overlay-title', paused ? 'Round paused' : this.round.status === 'finished' ? 'Round complete' : 'A minute on target.');
    text('range-overlay-copy', paused ? this.pauseReason || 'Adjust your controls, then resume.' : this.round.status === 'finished' ? `${this.round.score} points · ${this.round.accuracy}% accuracy · best streak ${this.round.bestStreak}. Start a new round to go again.` : gyro ? hint : 'Five moving targets. Small targets and bullseyes earn more. Release and press Fire for each shot.');
    text('range-binding-help', this.binding ? 'Listening for a controller press. Escape or Cancel stops binding.' : `Fire: ${this.buttonLabel(this.settings.fire)} · Center: ${this.buttonLabel(this.settings.recenter)} · Pause: ${this.buttonLabel(this.settings.pause)}. Duplicate bindings swap automatically.`);
  }

  private message(message: string): void { text('range-message', message); }

  private async fullscreen(): Promise<void> {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element('range-playfield').requestFullscreen(); }
    catch { this.message('Fullscreen is unavailable. You can still play in the page.'); }
  }
}
