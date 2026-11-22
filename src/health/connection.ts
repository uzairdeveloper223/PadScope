import type { HealthDevice } from './session.ts';

/** A manually recorded transport belongs to the selected Gamepad source. */
export class RecordedConnection {
  private source: string | null = null;
  private connection = 'not recorded';

  forDevice(device: HealthDevice | null): HealthDevice | null {
    if (!device) return null;
    if (device.api === 'hid') return { ...device };
    if (device.source !== this.source) { this.source = device.source; this.connection = 'not recorded'; }
    return { ...device, connection: this.connection };
  }

  remember(device: HealthDevice | null, connection: string): void {
    if (device?.api !== 'gamepad' || device.source !== this.source) return;
    if (['usb', 'bluetooth', 'wireless receiver', 'not recorded'].includes(connection)) this.connection = connection;
  }
}
