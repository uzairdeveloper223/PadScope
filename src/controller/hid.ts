import { buildOutput, familyFor, nominalCalibration, parseReport, parseSensorCalibration } from './protocol.ts';
import type { OutputCommand, SensorCalibration } from './protocol.ts';
import type { ControllerState, Family, Transport } from './state.ts';

export class HidController {
  device: HIDDevice | null = null;
  family: Family | null = null;
  transport: Transport | null = null;
  state: ControllerState | null = null;
  calibration: SensorCalibration = nominalCalibration();
  reportRate = 0;
  lastReport = 0;
  rawReport = '';
  rejectedReports = 0;
  private reports = 0;
  private rateStart = 0;
  private sequence = 0;
  private queue: Promise<void> = Promise.resolve();
  onChange: () => void = () => {};
  onDisconnect: () => void = () => {};

  get available(): boolean { return 'hid' in navigator && window.isSecureContext; }
  get connected(): boolean { return Boolean(this.device?.opened); }
  get fresh(): boolean { return this.connected && this.state !== null && performance.now() - this.lastReport < 1500; }
  get outputAvailable(): boolean {
    if (!this.device || !this.family || !this.transport) return false;
    const id = this.family === 'ds4' ? (this.transport === 'usb' ? 5 : 0x11) : (this.transport === 'usb' ? 2 : 0x31);
    return this.allCollections(this.device.collections).some(c => c.outputReports?.some(r => r.reportId === id));
  }

  constructor() {
    if ('hid' in navigator) navigator.hid.addEventListener('disconnect', event => {
      if (event.device === this.device) {
        this.state = null;
        this.device = null;
        this.family = null;
        this.transport = null;
        this.onDisconnect();
        this.onChange();
      }
    });
  }

  private allCollections(collections: HIDCollectionInfo[] = []): HIDCollectionInfo[] {
    return collections.flatMap(collection => [collection, ...this.allCollections(collection.children)]);
  }

  async connect(): Promise<boolean> {
    if (!this.available) throw new Error('Use desktop Chrome or Edge on HTTPS or localhost to connect hardware. Buttons and sticks still work through the Gamepad API.');
    const devices = await navigator.hid.requestDevice({ filters: [0x05c4, 0x09cc, 0x0ce6, 0x0df2].map(productId => ({ vendorId: 0x054c, productId, usagePage: 1, usage: 5 })) });
    if (!devices[0]) return false;
    await this.open(devices[0]);
    return true;
  }

  async reconnect(): Promise<void> {
    if (!this.available) return;
    const devices = await navigator.hid.getDevices();
    const device = devices.find(d => familyFor(d.vendorId, d.productId));
    if (device) await this.open(device);
  }

  private input = (event: HIDInputReportEvent): void => {
    if (!this.family || event.device !== this.device) return;
    const now = performance.now();
    const parsed = parseReport(this.family, event.reportId, event.data, now);
    if (!parsed) { this.rejectedReports++; return; }
    this.state = parsed.state;
    this.transport = parsed.transport;
    this.lastReport = now;
    this.reports++;
    if (now - this.rateStart >= 1000) {
      this.reportRate = Math.round(this.reports * 1000 / (now - this.rateStart));
      this.reports = 0;
      this.rateStart = now;
    }
    this.rawReport = [event.reportId, ...new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)].map(v => v.toString(16).padStart(2, '0')).join(' ');
  };

  private async open(device: HIDDevice): Promise<void> {
    if (this.device) await this.disconnect();
    if (!device.opened) await device.open();
    this.device = device;
    this.family = familyFor(device.vendorId, device.productId);
    const collections = this.allCollections(device.collections);
    const btId = this.family === 'ds4' ? 0x11 : 0x31;
    this.transport = collections.some(c => c.outputReports?.some(r => r.reportId === btId)) ? 'bluetooth' : 'usb';
    this.state = null;
    this.rateStart = performance.now();
    this.reports = 0;
    this.reportRate = 0;
    this.rejectedReports = 0;
    this.calibration = nominalCalibration();
    device.addEventListener('inputreport', this.input);
    this.onChange();
    try {
      const id = this.family === 'ds4' && this.transport === 'usb' ? 2 : 5;
      const data = await device.receiveFeatureReport(id);
      this.calibration = parseSensorCalibration(data, this.family!, this.transport) ?? nominalCalibration();
    } catch {
      // Third-party devices may omit factory calibration. Nominal scale is
      // explicitly labeled in the UI; local motion-zero still works.
    }
    this.onChange();
  }

  send(command: OutputCommand): Promise<void> {
    const device = this.device, family = this.family, transport = this.transport;
    if (!device || !family || !transport || !this.outputAvailable) return Promise.reject(new Error('Connect compatible hardware with an output report first.'));
    const output = buildOutput(family, transport, command, this.sequence++);
    const task = this.queue.catch(() => {}).then(() => device.sendReport(output.id, output.data as Uint8Array<ArrayBuffer>));
    this.queue = task;
    return task;
  }

  async disconnect(): Promise<void> {
    const device = this.device;
    if (!device) return;
    try { if (this.outputAvailable) await this.send({ motors: [0, 0] }); } finally {
      device.removeEventListener('inputreport', this.input);
      if (device.opened) await device.close();
      this.device = null;
      this.family = null;
      this.transport = null;
      this.state = null;
      this.onDisconnect();
      this.onChange();
    }
  }
}
