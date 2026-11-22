import './style.css';
import { HidController } from './controller/hid.ts';
import { MotionTracker, centerFromSamples, correctedAxes, defaultSettings, readSettings, saveSettings } from './controller/calibration.ts';
import type { Settings } from './controller/calibration.ts';
import { emptyState, gamepadState, previewState } from './controller/state.ts';
import type { Axes, Rotation, Vector3 } from './controller/state.ts';
import { InputUI, element, tag, text } from './ui.ts';
import { ModelView } from './model.ts';
import { setupEnvironment, setupTheme } from './environment.ts';
import { TargetRange } from './game/game.ts';
import { BlasterInspection } from './game/inspection.ts';
import type { RangeInput } from './game/game.ts';
import { WorkbenchAudio } from './audio.ts';
import { ControllerCheck } from './health/ui.ts';
import type { HealthDevice } from './health/session.ts';

class PadScope {
  private hid = new HidController();
  private ui = new InputUI();
  private model: ModelView | null = null;
  private range: TargetRange;
  private inspection: BlasterInspection;
  private check: ControllerCheck;
  private hidIdentities = new WeakMap<HIDDevice, number>();
  private nextHidIdentity = 0;
  private motion = new MotionTracker();
  private state = emptyState();
  private settings: Settings = defaultSettings();
  private preview = false;
  private active = false;
  private pad: Gamepad | null = null;
  private selectedIndex: number | null = null;
  private deviceKey = 'unconnected';
  private deviceSignature = '';
  private orientation: Rotation = [0, 0, 0, 1];
  private sensors: { gyro: Vector3 | null; accel: Vector3 | null } = { gyro: null, accel: null };
  private previousSensorTimestamp = 0;
  private frameTime = 0;
  private lastUI = 0;
  private stopTimer = 0;
  private noticeTimer = 0;
  private rumbling = false;
  private calibrating = false;
  private deadzone = element<HTMLInputElement>('deadzone');
  private followMotion = element<HTMLInputElement>('follow-motion');
  private connectionHint = '';

  constructor() {
    try { this.model = new ModelView(element('model-stage'), element('model-loading')); }
    catch (error) { console.error(error); text('model-loading', 'WebGL is unavailable. Enable hardware acceleration for the 3D model; input tools still work.'); }
    const audio = new WorkbenchAudio();
    this.range = new TargetRange(() => this.model?.createReplica() ?? null, audio);
    this.inspection = new BlasterInspection(audio);
    this.check = new ControllerCheck(() => this.settings, (value, report) => {
      if (this.preview || !this.active || this.healthDevice()?.source !== report.device.source || !this.settings.centers.every((center, index) => center === report.calibration.centers[index])) return false;
      this.settings.deadzone = value; this.syncSettings(); this.persist();
      text('calibration-status', `Measured ${Math.round(value * 100)}% deadzone applied. Raw controller-check readings are preserved.`);
      return true;
    });
    this.bindEvents();
    this.restoreAppearance();
    setupTheme();
    this.connectionHint = setupEnvironment(this.hid.available);
    this.hid.onChange = () => { this.deviceSignature = ''; };
    this.hid.onDisconnect = () => { this.rumbling = false; window.clearTimeout(this.stopTimer); this.notice('Hardware disconnected. Press a button to resume Gamepad input.'); };
    void this.hid.reconnect().catch(() => this.notice('Previously granted hardware could not open. Use Connect hardware to reconnect.'));
    window.requestAnimationFrame(this.frame);
  }

  private bindEvents(): void {
    element('connect-button').addEventListener('click', () => void this.connect());
    element('demo-button').addEventListener('click', () => void this.togglePreview());
    element('device-selector').addEventListener('change', event => {
      this.selectedIndex = Number((event.target as HTMLSelectElement).value);
      void this.hid.disconnect().catch(() => this.notice('Hardware could not close cleanly. Unplug it to reconnect.'));
      this.deviceSignature = '';
    });
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => {
      const view = button.dataset.view as 'front' | 'perspective';
      this.model?.setView(view);
      document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(node => { node.classList.toggle('selected', node === button); node.setAttribute('aria-pressed', String(node === button)); });
    }));
    element('reset-view').addEventListener('click', () => { this.model?.setView('front'); this.selectFront(); });
    element('fullscreen-button').addEventListener('click', () => void this.fullscreen());
    element('clear-session').addEventListener('click', () => { this.ui.clear(); this.notice('Button history and stick trails cleared.'); });
    element('calibrate-sticks').addEventListener('click', () => void this.calibrateCenters());
    element('zero-motion').addEventListener('click', () => void this.zeroMotion());
    this.deadzone.addEventListener('input', () => { this.settings.deadzone = Number(this.deadzone.value) / 100; text('deadzone-value', `${this.deadzone.value}%`); this.persist(); });
    element('reset-calibration').addEventListener('click', () => { this.settings = defaultSettings(); this.motion.reset(); this.range.invalidateGrip('Motion calibration reset. Center the game grip again.'); this.inspection.invalidateGrip(); this.syncSettings(); this.persist(); text('calibration-status', 'Centers, deadzone, and motion zero reset.'); });
    ['strong', 'weak'].forEach(name => element(`${name}-motor`).addEventListener('input', event => text(`${name}-value`, `${(event.target as HTMLInputElement).value}%`)));
    element('test-rumble').addEventListener('click', () => void this.testRumble());
    element('stop-rumble').addEventListener('click', () => void this.stopRumble());
    element('light-color').addEventListener('input', event => this.setColor((event.target as HTMLInputElement).value));
    document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.addEventListener('click', () => this.setColor(button.dataset.color!)));
    element('apply-color').addEventListener('click', () => void this.applyColor());
    element('shell-color').addEventListener('input', event => this.setShellColor((event.target as HTMLInputElement).value));
    document.querySelectorAll<HTMLButtonElement>('[data-shell]').forEach(button => button.addEventListener('click', () => this.setShellColor(button.dataset.shell!)));
    element('export-report').addEventListener('click', () => this.exportReport());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.rumbling) void this.stopRumble(); });
    window.addEventListener('pagehide', () => { if (this.rumbling) void this.stopRumble(); });
    window.addEventListener('gamepadconnected', () => { this.deviceSignature = ''; });
    window.addEventListener('gamepaddisconnected', event => {
      if ((event as GamepadEvent).gamepad.index === this.selectedIndex) { this.selectedIndex = null; this.rumbling = false; }
      this.deviceSignature = '';
    });
  }

  private frame = (time: number): void => {
    window.requestAnimationFrame(this.frame);
    if (document.hidden) return;
    this.frameTime = time;
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected)) : [];
    this.pad = pads.find(pad => pad.index === this.selectedIndex) ?? pads[0] ?? null;
    this.active = this.preview || this.hid.fresh || this.pad !== null;
    this.state = this.preview ? previewState(time / 1000) : this.hid.fresh ? this.hid.state! : this.pad ? gamepadState(this.pad) : emptyState();
    this.syncDevice(pads);
    this.check.update(time, { device: this.healthDevice(), axes: this.state.axes, buttons: this.state.buttons, timestamp: this.state.timestamp, active: this.active, preview: this.preview });
    this.updateMotion();
    const corrected = correctedAxes(this.state.axes, this.settings);
    this.ui.capture(this.state, this.active);
    this.model?.update(corrected, this.pad?.mapping === '' && !this.hid.fresh && !this.preview ? [] : this.state.buttons, this.orientation, this.followMotion.checked && this.sensors.gyro !== null, this.state.touches, this.state.touchSize);
    const rangeInput: RangeInput = { axes: corrected, buttons: this.state.buttons, pose: this.orientation, accel: this.sensors.accel,
      gyroAvailable: !this.preview && this.hid.fresh && this.sensors.gyro !== null, active: this.active, preview: this.preview,
      generic: Boolean(this.pad?.mapping === '' && !this.hid.fresh && !this.preview), source: `${this.deviceKey}:${this.preview ? 'preview' : this.hid.fresh ? 'hid' : 'gamepad'}` };
    this.range.update(time, rangeInput); this.inspection.update(time, rangeInput);
    if (time - this.lastUI >= 50) {
      this.lastUI = time;
      this.ui.update(this.state, corrected, this.settings.deadzone, this.active, this.sensors);
      this.updateDeviceReadings();
      this.updateCapabilities();
    }
  };

  private keyForDevice(): string {
    if (this.preview) return 'preview';
    if (this.hid.fresh) return `hid:${this.hid.device!.vendorId.toString(16)}:${this.hid.device!.productId.toString(16)}`;
    if (!this.pad) return 'unconnected';
    const ids = this.pad.id.match(/Vendor:\s*([0-9a-f]{4}).*Product:\s*([0-9a-f]{4})/i);
    return ids ? `hid:${parseInt(ids[1], 16).toString(16)}:${parseInt(ids[2], 16).toString(16)}` : `gamepad:${this.pad.id}`;
  }

  private healthDevice(): HealthDevice | null {
    if (this.preview) return null;
    if (this.hid.fresh) {
      const device = this.hid.device!;
      if (!this.hidIdentities.has(device)) this.hidIdentities.set(device, ++this.nextHidIdentity);
      return { source: `${this.deviceKey}:hid:${this.hidIdentities.get(device)}`, key: this.deviceKey, name: device.productName,
        api: 'hid', mapping: 'sony-hid', connection: this.hid.transport ?? 'not recorded', axes: 4, buttons: this.state.buttons.length };
    }
    return this.pad ? { source: `${this.deviceKey}:gamepad:${this.pad.index}`, key: this.deviceKey, name: this.pad.id,
      api: 'gamepad', mapping: this.pad.mapping === 'standard' ? 'standard' : 'unmapped', connection: 'not recorded', axes: this.pad.axes.length, buttons: this.pad.buttons.length } : null;
  }

  private syncDevice(pads: Gamepad[]): void {
    const key = this.keyForDevice();
    if (key !== this.deviceKey) {
      this.deviceKey = key;
      this.settings = key === 'preview' ? defaultSettings() : readSettings(key);
      this.motion.reset(); this.previousSensorTimestamp = 0; this.orientation = [0, 0, 0, 1];
      this.ui.clear(); this.syncSettings();
      text('calibration-status', key === 'preview' ? 'Preview calibration is simulated and is not saved.' : 'Stick centers and gyro bias saved in this browser. Motion pose starts centered each connection.');
    }
    const generic = Boolean(this.pad?.mapping === '' && !this.hid.fresh && !this.preview);
    this.ui.setGeneric(generic);
    const signature = `${key}:${this.hid.connected}:${this.hid.fresh}:${this.preview}:${pads.map(p => `${p.index}:${p.id}`).join('|')}`;
    if (signature === this.deviceSignature) return;
    this.deviceSignature = signature;
    const selector = element<HTMLSelectElement>('device-selector');
    selector.replaceChildren();
    for (const pad of pads) { const option = new Option(`Pad ${pad.index + 1}: ${pad.id}`, String(pad.index)); selector.add(option); }
    selector.value = String(this.pad?.index ?? 0);
    selector.hidden = pads.length < 2 || this.preview;
    const name = this.preview ? 'Preview controller · simulated input' : this.hid.fresh ? this.hid.device!.productName : this.pad?.id ?? (this.hid.connected ? 'Hardware opened · waiting for reports' : 'Waiting for a controller');
    text('device-name', name);
    element('device-name').title = name;
    const source = this.preview ? 'Preview' : this.hid.fresh ? `Hardware connected · ${this.hid.transport === 'usb' ? 'USB' : 'Bluetooth'}` : this.pad ? generic ? 'Unmapped Gamepad' : 'Gamepad input' : 'No input';
    tag('device-protocol', source, this.preview ? 'preview' : this.active ? 'ready' : '');
    element('connection-dot').className = `status-dot ${this.preview ? 'preview' : this.active ? 'connected' : ''}`;
    text('model-status', this.preview ? 'Simulated input' : this.hid.fresh && this.state.gyro ? 'Live input + motion' : this.active ? 'Live input' : '3D view');
    text('input-summary', this.preview ? 'Preview only · hardware output disabled' : this.hid.fresh ? 'Raw HID input · report rate measured in browser' : generic ? 'Unmapped inputs · PS labels and trigger mapping are unavailable' : this.hid.available ? 'Gamepad input · Hardware features via WebHID' : 'Gamepad input · Advanced HID unavailable in this browser');
    text('connect-label', this.hid.connected ? 'Disconnect hardware' : 'Connect hardware');
    element('connection-hint').hidden = this.active && !generic;
    if (generic) text('connection-hint-copy', 'This controller has no standard browser mapping. Buttons use raw indices; stick axes use the first four axes. Connect supported HID hardware for PS-layout mapping.');
    else if (this.hid.connected && !this.hid.fresh) text('connection-hint-copy', 'Hardware opened, but no supported input reports have arrived. Press a button or reconnect with a USB data cable.');
    else text('connection-hint-copy', this.connectionHint);
  }

  private updateDeviceReadings(): void {
    text('battery-value', this.state.battery === null ? 'Battery —' : `Battery ~${this.state.battery}%${this.state.charging ? ' · charging' : ''}`);
    text('report-rate', this.hid.fresh && !this.preview ? `${this.hid.reportRate || '—'} Hz` : '— Hz');
    element('report-rate').title = this.hid.fresh ? 'HID reports received per second; this is not latency.' : 'Report rate requires raw HID input.';
  }

  private updateMotion(): void {
    if (!this.active || !this.state.gyro || !this.state.accel) { this.sensors = { gyro: null, accel: null }; this.orientation = [0, 0, 0, 1]; return; }
    const calibration = this.hid.calibration;
    const gyro = this.preview ? this.state.gyro : this.state.gyro.map((n, i) => n * calibration.gyroScale[i]) as Vector3;
    const accel = this.preview ? this.state.accel : this.state.accel.map((n, i) => (n - calibration.accelBias[i]) * calibration.accelScale[i]) as Vector3;
    this.sensors = { gyro: gyro.map((n, i) => n - this.settings.gyroBias[i]) as Vector3, accel };
    if (this.state.timestamp !== this.previousSensorTimestamp) {
      this.previousSensorTimestamp = this.state.timestamp;
      this.orientation = this.motion.update(gyro, accel, this.state.timestamp, this.settings.gyroBias);
    }
  }

  private actuator(): GamepadHapticActuator | null {
    if (this.preview || !this.pad) return null;
    if (this.hid.fresh) {
      // Avoid vibrating a different pad when HID and Gamepad devices coexist.
      const product = this.hid.device!.productId.toString(16).padStart(4, '0');
      if (!this.pad.id.toLowerCase().includes(product)) return null;
    }
    const actuator = this.pad.vibrationActuator;
    return actuator && typeof actuator.playEffect === 'function' ? actuator : null;
  }

  private updateCapabilities(): void {
    const output = !this.preview && this.hid.outputAvailable;
    const rumble = !this.preview && (output || this.actuator() !== null);
    element<HTMLButtonElement>('calibrate-sticks').disabled = !this.active || this.calibrating;
    element<HTMLButtonElement>('zero-motion').disabled = !this.sensors.gyro || this.calibrating;
    element<HTMLButtonElement>('test-rumble').disabled = !rumble || this.rumbling;
    element<HTMLButtonElement>('stop-rumble').disabled = !this.rumbling;
    element<HTMLButtonElement>('apply-color').disabled = !output;
    tag('rumble-tag', this.preview ? 'Preview only' : output ? 'HID rumble' : this.actuator() ? 'Gamepad haptics' : this.active ? 'Not exposed' : 'Connect a controller', rumble ? 'ready' : '');
    tag('touch-tag', this.preview ? 'Simulated' : this.state.touches !== null ? 'HID contacts' : this.hid.available ? 'WebHID required' : 'Desktop WebHID', this.preview ? 'preview' : this.state.touches !== null ? 'ready' : '');
    tag('motion-tag', this.preview ? 'Simulated sensors' : this.sensors.gyro ? this.hid.calibration.factory ? 'Factory scale' : 'Nominal scale' : this.hid.available ? 'Waiting for sensor data' : 'Desktop WebHID', this.preview ? 'preview' : this.sensors.gyro ? 'ready' : '');
    tag('light-tag', output ? 'HID output available' : 'Model preview', output ? 'ready' : '');
    text('motion-description', this.preview ? 'Simulated motion. Real sensor readings appear after connection.' : this.sensors.gyro ? this.motion.stationary ? 'Controller resting. Model held steady; sensor readings stay live.' : 'Motion follows your controller. Small sensor offsets are corrected at rest.' : this.hid.available ? 'Connect hardware to bring the model into your hands.' : 'Live motion needs desktop Chrome or Edge. Try the preview to see the model move.');
    tag('calibration-tag', this.preview ? 'Preview settings' : 'Local calibration', this.preview ? 'preview' : '');
    const touchText = this.preview ? 'Simulated touch surface' : this.state.touches !== null ? 'Touch the controller pad' : this.hid.available ? 'Connect hardware, then touch the pad' : 'Live touch needs desktop Chrome or Edge';
    text('touch-placeholder', touchText);
  }

  private syncSettings(): void { this.deadzone.value = String(Math.round(this.settings.deadzone * 100)); text('deadzone-value', `${this.deadzone.value}%`); }

  private persist(): void {
    if (this.preview || this.deviceKey === 'unconnected') return;
    const saved = saveSettings(this.deviceKey, this.settings);
    if (!saved) text('calibration-status', 'Settings apply this session. Browser storage is unavailable.');
  }

  private async connect(): Promise<void> {
    const button = element<HTMLButtonElement>('connect-button');
    button.disabled = true;
    try {
      if (this.hid.connected) await this.hid.disconnect();
      else {
        if (this.preview) await this.togglePreview();
        const connected = await this.hid.connect();
        if (connected) this.notice('Hardware opened. Press a button and move your controller.');
      }
    } catch (error) { this.notice(`Could not connect: ${error instanceof Error ? error.message : 'Select the controller and check OS HID permissions.'}`); }
    finally { button.disabled = false; this.deviceSignature = ''; }
  }

  private async togglePreview(): Promise<void> {
    if (this.rumbling) await this.stopRumble();
    this.preview = !this.preview;
    text('demo-button', this.preview ? 'Exit preview' : 'Try a preview');
    element('demo-button').classList.toggle('active', this.preview);
    this.deviceSignature = '';
    this.ui.clear();
  }

  private selectFront(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => { const selected = button.dataset.view === 'front'; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }

  private async fullscreen(): Promise<void> {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element('model-stage').parentElement!.requestFullscreen(); }
    catch { this.notice('Fullscreen is unavailable in this browser. The controller can still be rotated and zoomed.'); }
  }

  private sample<T>(read: () => T, duration = 1200): Promise<T[]> {
    return new Promise(resolve => {
      const key = this.deviceKey, started = performance.now(), samples: T[] = [];
      const capture = () => {
        if (this.deviceKey !== key || !this.active || document.hidden) { resolve([]); return; }
        samples.push(read());
        if (performance.now() - started >= duration) resolve(samples);
        else window.setTimeout(capture, 16);
      };
      capture();
    });
  }

  private async calibrateCenters(): Promise<void> {
    if (!this.active || this.calibrating) return;
    this.calibrating = true;
    text('calibration-status', 'Sampling centers… release both sticks and keep still.');
    const samples = await this.sample(() => [...this.state.axes] as Axes);
    const centers = centerFromSamples(samples);
    if (centers) { this.settings.centers = centers; this.persist(); text('calibration-status', `Centers saved: ${centers.map(n => n.toFixed(3)).join(' / ')}.`); this.ui.left.clear(); this.ui.right.clear(); }
    else text('calibration-status', 'Center sampling failed. Release the sticks, keep this page visible, and try again.');
    this.calibrating = false;
  }

  private async zeroMotion(): Promise<void> {
    if (!this.sensors.gyro || this.calibrating) return;
    this.calibrating = true;
    text('calibration-status', 'Sampling motion… hold the controller still in your resting pose.');
    const samples = await this.sample(() => this.sensors.gyro ? this.sensors.gyro.map((n, i) => n + this.settings.gyroBias[i]) as Vector3 : null);
    const usable = samples.filter((s): s is Vector3 => s !== null);
    const means = [0, 1, 2].map(i => usable.reduce((sum, s) => sum + s[i], 0) / Math.max(1, usable.length)) as Vector3;
    const still = usable.length >= 20 && usable.every(s => s.every((n, i) => Math.abs(n - means[i]) < 3)) && means.every(n => Math.abs(n) < 100) && this.sensors.accel !== null && Math.hypot(...this.sensors.accel) > .5;
    if (still) { this.settings.gyroBias = means; this.motion.recenter(); this.range.invalidateGrip('Motion zero changed. Center the game grip again.'); this.inspection.invalidateGrip(); this.persist(); text('calibration-status', 'Gyro bias saved. The model is centered on this resting pose.'); }
    else text('calibration-status', 'Motion zero failed. Hold still with this page visible and check that sensor readings change.');
    this.calibrating = false;
  }

  private async testRumble(): Promise<void> {
    if (this.preview || this.rumbling) return;
    const strong = Number(element<HTMLInputElement>('strong-motor').value) / 100;
    const weak = Number(element<HTMLInputElement>('weak-motor').value) / 100;
    const duration = Number(element<HTMLSelectElement>('rumble-duration').value);
    this.rumbling = true;
    this.updateCapabilities();
    text('rumble-status', 'Sending rumble command…');
    try {
      if (this.hid.outputAvailable) {
        await this.hid.send({ motors: [strong, weak] });
        text('rumble-status', 'Rumble command sent. Check the physical controller.');
        this.stopTimer = window.setTimeout(() => void this.stopRumble(), duration);
      } else {
        const actuator = this.actuator();
        if (!actuator) throw new Error('This device does not expose a rumble actuator.');
        const result = await actuator.playEffect('dual-rumble', { duration, startDelay: 0, strongMagnitude: strong, weakMagnitude: weak });
        this.rumbling = false;
        text('rumble-status', result === 'complete' ? 'Rumble test completed.' : 'Rumble test stopped.');
      }
    } catch (error) {
      this.rumbling = false;
      text('rumble-status', `Rumble could not start. ${error instanceof Error ? error.message : 'Reconnect hardware and try again.'}`);
    }
  }

  private async stopRumble(): Promise<void> {
    window.clearTimeout(this.stopTimer);
    try {
      if (!this.preview && this.hid.outputAvailable) await this.hid.send({ motors: [0, 0] });
      else await this.actuator()?.reset();
      text('rumble-status', 'Rumble stopped.');
    } catch { text('rumble-status', 'Stop command could not be sent. Reconnect or unplug the controller.'); }
    finally { this.rumbling = false; }
  }

  private setColor(color: string): void {
    element<HTMLInputElement>('light-color').value = color;
    text('color-hex', color.toUpperCase());
    this.model?.setColor(color);
    try { localStorage.setItem('padscope:light-color', color); } catch { /* Session-only appearance. */ }
    document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => { const selected = button.dataset.color === color; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  }

  private setShellColor(color: string): void {
    element<HTMLInputElement>('shell-color').value = color;
    text('shell-hex', color.toUpperCase());
    this.model?.setShellColor(color);
    document.querySelectorAll<HTMLButtonElement>('[data-shell]').forEach(button => { const selected = button.dataset.shell === color; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    try { localStorage.setItem('padscope:shell-color', color); } catch { /* Session-only appearance. */ }
  }

  private restoreAppearance(): void {
    const readColor = (key: string, fallback: string) => {
      try { const value = localStorage.getItem(`padscope:${key}`); return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; } catch { return fallback; }
    };
    this.setShellColor(readColor('shell-color', '#202226'));
    this.setColor(readColor('light-color', '#408cff'));
  }

  private async applyColor(): Promise<void> {
    if (this.preview || !this.hid.outputAvailable) return;
    const color = element<HTMLInputElement>('light-color').value;
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
    try { await this.hid.send({ color: rgb }); text('light-status', `${color.toUpperCase()} command sent. Check the controller; LED color has no readback.`); }
    catch { text('light-status', 'Color command failed. Reconnect hardware and try again.'); }
  }

  private exportReport(): void {
    const report = {
      app: 'PadScope', version: '1.0.0', exportedAt: new Date().toISOString(),
      mode: this.preview ? 'simulated-preview' : this.active ? 'live' : 'disconnected',
      device: this.preview ? 'Preview controller' : this.hid.fresh ? { name: this.hid.device!.productName, vendorId: this.hid.device!.vendorId, productId: this.hid.device!.productId, family: this.hid.family, transport: this.hid.transport } : this.pad ? { name: this.pad.id, mapping: this.pad.mapping, index: this.pad.index } : null,
      input: this.state, calibratedAxes: correctedAxes(this.state.axes, this.settings), sensors: this.sensors,
      calibration: this.settings, calibrationScope: 'PadScope only; controller firmware is unchanged',
      reportRateHz: !this.preview && this.hid.fresh ? this.hid.reportRate : null,
      sensorScale: this.preview ? 'simulated' : this.hid.fresh ? this.hid.calibration : null,
      rawHidReport: !this.preview && this.hid.fresh ? this.hid.rawReport : null,
      buttonsTested: [...this.ui.tested], recentPresses: this.ui.events,
      selectedLightbarColor: element<HTMLInputElement>('light-color').value,
      modelShellColor: element<HTMLInputElement>('shell-color').value, modelOrientation: this.orientation,
      ledColorReadback: null, timestampOfView: this.frameTime,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `padscope-${this.preview ? 'preview-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.notice('Controller report exported as JSON.');
  }

  private notice(message: string): void {
    window.clearTimeout(this.noticeTimer);
    text('notice', message); element('notice').hidden = false;
    this.noticeTimer = window.setTimeout(() => { element('notice').hidden = true; }, 9000);
  }
}

new PadScope();
