import { buttonNames } from './controller/state.ts';
import type { Axes, ControllerState, Vector3 } from './controller/state.ts';
import { StickPlot } from './plots.ts';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}

const nodes = new Map<string, HTMLElement>();
export function text(id: string, value: string): void {
  let node = nodes.get(id);
  if (!node) { node = element(id); nodes.set(id, node); }
  if (node.textContent !== value) node.textContent = value;
}
export function tag(id: string, value: string, mode = ''): void {
  const node = element(id);
  if (node.textContent !== value) node.textContent = value;
  node.className = `tag ${mode}`;
}

const signed = (value: number, digits = 3) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

export class InputUI {
  readonly left = new StickPlot(element<HTMLCanvasElement>('left-plot'), '#23776a');
  readonly right = new StickPlot(element<HTMLCanvasElement>('right-plot'), '#bd4a2d');
  readonly tested = new Set<number>();
  readonly events: { button: string; time: string; at: number }[] = [];
  private previous: number[] = [];
  private keys: HTMLElement[] = [];
  private trails = element<HTMLInputElement>('trails-toggle');
  private touchContacts = [element('touch-0'), element('touch-1')];
  private touchSurface = element('touch-surface');
  private touchPlaceholder = element('touch-placeholder');
  private meters = [element<HTMLMeterElement>('l2-meter'), element<HTMLMeterElement>('r2-meter')];
  private logDirty = true;
  private generic = false;

  constructor() {
    this.renderKeys();
  }

  private renderKeys(): void {
    const strip = element('button-readings');
    strip.replaceChildren();
    this.keys = [];
    const iconNames: Record<number, string> = { 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    const shortNames = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'PS', 'Touch', 'Mute'];
    buttonNames.forEach((name, i) => {
      if ([4, 8, 12, 16].includes(i)) { const divider = document.createElement('span'); divider.className = 'key-divider'; divider.setAttribute('aria-hidden', 'true'); strip.append(divider); }
      const node = document.createElement('span');
      node.className = 'input-key unavailable';
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label', `${name}: no input`);
      node.title = this.generic ? `Button ${i}` : `${name} · Button ${i}`;
      if (this.generic) node.textContent = `B${i}`;
      else if (iconNames[i]) node.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${iconNames[i]}"/></svg>`;
      else node.textContent = shortNames[i];
      this.keys.push(node);
      strip.append(node);
    });
  }

  setGeneric(generic: boolean): void {
    if (generic === this.generic) return;
    this.generic = generic;
    // Unmapped pads have no guaranteed PS button order; show raw indices.
    this.clear();
    this.renderKeys();
  }

  capture(state: ControllerState, active: boolean): void {
    state.buttons.forEach((value, index) => {
      if (active && value >= .5 && (this.previous[index] ?? 0) < .5) {
        this.tested.add(index);
        const now = new Date();
        this.events.unshift({ button: this.generic ? `Button ${index}` : buttonNames[index] ?? `Button ${index}`, time: now.toLocaleTimeString([], { hour12: false }), at: now.getTime() });
        if (this.events.length > 100) this.events.pop();
        this.logDirty = true;
      }
    });
    this.previous = active ? [...state.buttons] : [];
  }

  clear(): void {
    this.tested.clear(); this.events.splice(0); this.previous = [];
    this.left.clear(); this.right.clear(); this.logDirty = true;
  }

  update(state: ControllerState, corrected: Axes, deadzone: number, active: boolean, sensors: { gyro: Vector3 | null; accel: Vector3 | null }): void {
    const ids = ['lx', 'ly', 'rx', 'ry'];
    ids.forEach((id, i) => text(id, active ? signed(corrected[i]) : '—'));
    text('left-raw', active ? `${signed(state.axes[0])} / ${signed(state.axes[1])}` : '— / —');
    text('right-raw', active ? `${signed(state.axes[2])} / ${signed(state.axes[3])}` : '— / —');
    text('left-drift', active ? `Drift ${(Math.hypot(state.axes[0], state.axes[1]) * 100).toFixed(1)}%` : 'Drift —');
    text('right-drift', active ? `Drift ${(Math.hypot(state.axes[2], state.axes[3]) * 100).toFixed(1)}%` : 'Drift —');
    this.left.draw([state.axes[0], state.axes[1]], [corrected[0], corrected[1]], deadzone, this.trails.checked, active);
    this.right.draw([state.axes[2], state.axes[3]], [corrected[2], corrected[3]], deadzone, this.trails.checked, active);
    ['l2', 'r2'].forEach((name, i) => {
      const value = state.buttons[6 + i] ?? 0;
      text(`${name}-value`, active && !this.generic ? `${Math.round(value * 100)}%` : '—');
      this.meters[i].value = active && !this.generic ? value : 0;
    });
    this.keys.forEach((node, i) => {
      const available = active && i < state.buttons.length;
      const pressed = available && state.buttons[i] >= .5;
      node.classList.toggle('pressed', pressed);
      node.classList.toggle('tested', this.tested.has(i));
      node.classList.toggle('unavailable', !available);
      const label = this.generic ? `Button ${i}` : buttonNames[i];
      node.setAttribute('aria-label', `${label}: ${!available ? 'not available' : pressed ? 'pressed' : 'released'}${this.tested.has(i) ? ', tested' : ''}`);
    });
    text('button-coverage', `${this.tested.size}${active ? ` / ${state.buttons.length}` : ''} tested`);
    const hasContacts = Boolean(state.touches?.some(touch => touch.active));
    this.touchPlaceholder.hidden = hasContacts;
    this.touchSurface.classList.toggle('clicked', Boolean(state.buttons[17]));
    this.touchSurface.style.borderColor = state.buttons[17] && active ? 'var(--orange)' : '';
    this.touchContacts.forEach((node, i) => {
      const touch = state.touches?.[i];
      node.hidden = !active || !touch?.active;
      if (touch?.active && active) {
        node.style.left = `${Math.min(98, Math.max(2, touch.x / state.touchSize[0] * 100))}%`;
        node.style.top = `${Math.min(94, Math.max(6, touch.y / state.touchSize[1] * 100))}%`;
      }
      text(`touch-value-${i}`, active && touch?.active ? `${touch.x}, ${touch.y}` : '—');
    });
    ['x', 'y', 'z'].forEach((axis, i) => {
      text(`gyro-${axis}`, sensors.gyro ? signed(sensors.gyro[i], 1) : '—');
      text(`accel-${axis}`, sensors.accel ? signed(sensors.accel[i], 2) : '—');
    });
    this.renderLog();
  }

  private renderLog(): void {
    if (!this.logDirty) return;
    this.logDirty = false;
    const log = element('event-log');
    log.replaceChildren();
    if (!this.events.length) { const placeholder = document.createElement('span'); placeholder.className = 'log-empty'; placeholder.textContent = 'Press a button to start your input trail.'; log.append(placeholder); return; }
    for (const event of this.events.slice(0, 8)) {
      const node = document.createElement('span'); node.className = 'log-event';
      const label = document.createElement('span'); label.textContent = event.button;
      const time = document.createElement('time'); time.textContent = event.time; time.dateTime = new Date(event.at).toISOString();
      node.append(label, time); log.append(node);
    }
  }
}
