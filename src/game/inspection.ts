import { Quaternion, Euler } from 'three';
import { InspectionPose } from './inspection-pose.ts';
import { InspectionView } from './inspection-view.ts';
import { ButtonEdges } from './input.ts';
import { blasterIds } from './blasters.ts';
import type { BlasterId } from './aim.ts';
import type { RangeInput } from './game.ts';
import { buttonNames } from '../controller/state.ts';
import { element, tag, text } from '../ui.ts';
import type { WorkbenchAudio } from '../audio.ts';

interface InspectionSettings { version: 1; weapon: BlasterId; zoom: number; center: number; freeze: number }
const defaults = (): InspectionSettings => ({ version: 1, weapon: 'compact', zoom: 1, center: 2, freeze: 9 });

export class BlasterInspection {
  private pose = new InspectionPose();
  private edges = new ButtonEdges();
  private view: InspectionView | null = null;
  private input: RangeInput | null = null;
  private settings = defaults();
  private opened = false;
  private loading = false;
  private lastUI = 0;
  private optionSignature = '';
  private focused = true;
  private rearmButtons = true;
  private showcase = new Quaternion().setFromEuler(new Euler(.15, .8, 0));

  constructor(private audio?: WorkbenchAudio) {
    try {
      const s = JSON.parse(localStorage.getItem('padscope:inspection') ?? 'null') as InspectionSettings | null;
      if (s?.version === 1 && blasterIds.includes(s.weapon) && Number.isFinite(s.zoom) && s.zoom >= .7 && s.zoom <= 1.6 &&
          [s.center, s.freeze].every(n => Number.isInteger(n) && n >= 0 && n < 64) && s.center !== s.freeze) this.settings = s;
    } catch { /* Use session defaults. */ }
    element('inspect-toggle').addEventListener('click', () => void this.toggle());
    element('inspect-center').addEventListener('click', () => this.center());
    element('inspect-freeze').addEventListener('click', () => this.freeze());
    element('inspect-settings').addEventListener('change', event => {
      const target = event.target as HTMLSelectElement;
      if (target.id === 'inspect-weapon') this.settings.weapon = target.value as BlasterId;
      if (target.id === 'inspect-map-center' || target.id === 'inspect-map-freeze') {
        const action = target.id === 'inspect-map-center' ? 'center' : 'freeze', other = action === 'center' ? 'freeze' : 'center';
        const index = Number(target.value);
        if (this.settings[other] === index) this.settings[other] = this.settings[action];
        this.settings[action] = index; this.seed();
      }
      this.persist(); this.syncSettings(); this.updateUI();
    });
    element('inspect-zoom').addEventListener('input', event => {
      this.settings.zoom = Number((event.target as HTMLInputElement).value) / 100;
      text('inspect-zoom-value', `${Math.round(this.settings.zoom * 100)}%`); this.persist();
    });
    element('inspect-stage').addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (key !== 'c' && key !== 'f') return;
      event.preventDefault();
      if (!event.repeat) { if (key === 'c') this.center(); else this.freeze(); }
    });
    window.addEventListener('blur', () => { this.focused = false; this.rearmButtons = true; this.suspend('Inspection frozen while the page is unfocused. Resume when ready.'); });
    window.addEventListener('focus', () => { this.focused = true; this.updateUI(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.rearmButtons = true; this.suspend('Inspection frozen while the page is hidden.'); } });
    element('inspect-fullscreen').hidden = !document.fullscreenEnabled;
    element('inspect-fullscreen').addEventListener('click', () => void this.fullscreen());
    this.populateMappings(); this.syncSettings(); this.updateUI();
  }

  private get motionAvailable(): boolean { return Boolean(this.input?.active && !this.input.preview && this.input.gyroAvailable); }
  private get interactive(): boolean { return Boolean(this.opened && this.focused && !document.hidden && this.view?.ready && this.view.visible && !this.view.lost); }
  private seed(): void { this.edges.seed(this.motionAvailable ? this.input!.buttons : []); }

  private async toggle(): Promise<void> {
    this.opened = !this.opened;
    element('inspect-body').hidden = !this.opened;
    element('inspect-toggle').setAttribute('aria-expanded', String(this.opened));
    text('inspect-toggle', this.opened ? 'Close inspection' : 'Open blaster inspection');
    if (this.opened) this.audio?.unlock('inspection');
    else this.audio?.setActive('inspection', false);
    this.seed();
    this.rearmButtons = true;
    if (!this.opened) { this.suspend('Inspection frozen. Reopen and resume when ready.'); return; }
    if (this.view?.ready || this.loading) { this.updateUI(); return; }
    this.loading = true;
    try {
      this.view ??= new InspectionView(element('inspect-stage'), element('inspect-loading'));
      await this.view.load();
      this.message('Blasters ready. Hold the sideways grip and center it to start live inspection.');
    } catch (error) {
      console.error('Blaster inspection could not load', error);
      this.message('Inspection could not open. Close and reopen to retry; check that hardware acceleration is enabled.');
    } finally { this.loading = false; this.updateUI(); }
  }

  update(time: number, input: RangeInput): void {
    const prior = this.input; this.input = input;
    if (prior && prior.source !== input.source) this.invalidateGrip('Controller input changed. Center your inspection grip again.');
    if (!this.motionAvailable && this.pose.centered) this.invalidateGrip('Live motion unavailable. Reconnect hardware, then center your grip.');
    this.audio?.setActive('inspection', Boolean(this.opened && this.view?.ready && this.view.visible && !this.view.lost));
    if (!this.opened || !this.view) return;
    if (!this.view.visible || this.view.lost) this.suspend('Inspection frozen. Resume when the model is visible again.');
    if (!this.interactive) this.rearmButtons = true;
    else if (this.rearmButtons) { this.seed(); this.rearmButtons = false; }
    const pressed = this.edges.update(this.motionAvailable ? input.buttons : []);
    if (this.interactive) {
      if (pressed.includes(this.settings.center)) this.center();
      if (pressed.includes(this.settings.freeze)) this.freeze();
    }
    if (this.view.visible && this.view.ready && !this.view.lost) {
      if (this.motionAvailable) this.pose.update(input.pose);
      this.view.render(this.pose.centered ? this.pose.rotation : this.showcase, this.settings.weapon, this.settings.zoom);
    }
    if (time - this.lastUI >= 100) { this.lastUI = time; this.updateUI(); }
  }

  invalidateGrip(message = 'Motion reference changed. Center your inspection grip again.'): void {
    this.pose.clear(); this.seed(); this.message(message); this.updateUI();
  }

  private center(): void {
    if (!this.interactive || !this.motionAvailable || !this.input?.accel) return;
    if (this.pose.center(this.input.pose, this.input.accel)) {
      this.seed(); this.message('Grip centered. Rotate the controller to inspect every side of the blaster.');
      element('inspect-stage').focus({ preventScroll: true });
    } else this.message('Hold still with the left handle pointing toward the screen, then center again.');
    this.updateUI();
  }

  private freeze(): void {
    if (!this.interactive || !this.motionAvailable || !this.pose.centered) return;
    this.pose.toggleFreeze(); this.seed();
    this.message(this.pose.frozen ? 'Pose frozen. Zoom or change blasters to examine this angle.' : 'Live rotation resumed. The blaster follows your current grip.');
    this.updateUI();
  }

  private suspend(message: string): void {
    if (!this.pose.centered || this.pose.frozen) return;
    this.pose.toggleFreeze(); this.message(message); this.updateUI();
  }

  private populateMappings(): void {
    const generic = this.input?.generic ?? false;
    const count = Math.max(Math.min(64, this.input?.buttons.length || 18), this.settings.center + 1, this.settings.freeze + 1);
    const signature = `${count}:${generic}`;
    if (signature === this.optionSignature) return;
    this.optionSignature = signature;
    for (const action of ['center', 'freeze'] as const) {
      const select = element<HTMLSelectElement>(`inspect-map-${action}`); select.replaceChildren();
      for (let i = 0; i < count; i++) select.add(new Option(generic ? `Button ${i}` : buttonNames[i] ?? `Button ${i}`, String(i)));
    }
    this.syncSettings();
  }

  private syncSettings(): void {
    element<HTMLSelectElement>('inspect-weapon').value = this.settings.weapon;
    element<HTMLInputElement>('inspect-zoom').value = String(Math.round(this.settings.zoom * 100));
    text('inspect-zoom-value', `${Math.round(this.settings.zoom * 100)}%`);
    for (const action of ['center', 'freeze'] as const) element<HTMLSelectElement>(`inspect-map-${action}`).value = String(this.settings[action]);
  }

  private updateUI(): void {
    this.populateMappings();
    const ready = Boolean(this.view?.ready), available = this.motionAvailable;
    element<HTMLButtonElement>('inspect-center').disabled = !this.interactive || !available;
    element<HTMLButtonElement>('inspect-freeze').disabled = !this.interactive || !available || !this.pose.centered;
    element('inspect-freeze').setAttribute('aria-pressed', String(this.pose.frozen));
    text('inspect-freeze', this.pose.frozen ? 'Resume rotation' : 'Freeze pose');
    tag('inspect-status', !available ? 'Live motion required' : !this.pose.centered ? 'Center grip first' : this.pose.frozen ? 'Pose frozen' : 'Live · 1:1 rotation', available && this.pose.centered ? 'ready' : '');
    text('inspect-turn', this.pose.centered ? `${Math.round(this.pose.turnDegrees)}°` : '—');
    element('inspect-overlay').hidden = !ready || this.pose.centered;
    text('inspect-overlay-title', available ? 'Center your blaster grip' : 'Connect live motion');
    text('inspect-overlay-copy', available ? 'Point the left handle toward the screen, hold still, then select Center grip.' : 'Use Connect hardware in desktop Chrome or Edge. Inspection needs real controller motion; preview inputs do not move the blaster.');
  }

  private persist(): void {
    try { localStorage.setItem('padscope:inspection', JSON.stringify(this.settings)); }
    catch { this.message('Inspection settings apply this session. Browser storage is unavailable.'); }
  }
  private message(message: string): void { text('inspect-message', message); }
  private async fullscreen(): Promise<void> {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element('inspect-playfield').requestFullscreen(); }
    catch { this.message('Fullscreen is unavailable. You can still inspect the blaster in the page.'); }
  }
}
