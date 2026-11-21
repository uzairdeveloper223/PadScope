export type Family = 'ds4' | 'dualsense';
export type Transport = 'usb' | 'bluetooth';
export type Vector3 = [number, number, number];
export type Rotation = [number, number, number, number];
export type Axes = [number, number, number, number];
export interface Contact { active: boolean; id: number; x: number; y: number }
export interface ControllerState {
  axes: Axes;
  buttons: number[];
  gyro: Vector3 | null;
  accel: Vector3 | null;
  touches: Contact[] | null;
  touchSize: [number, number];
  battery: number | null;
  charging: boolean;
  timestamp: number;
}

export const buttonNames = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share / Create', 'Options', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'PS', 'Touchpad', 'Mute'];
export const buttonParts = ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'create', 'options', 'left-stick', 'right-stick', 'up', 'down', 'left', 'right', 'ps', 'touchpad', 'mute'];

export function emptyState(): ControllerState {
  return { axes: [0, 0, 0, 0], buttons: [], gyro: null, accel: null, touches: null, touchSize: [1920, 942], battery: null, charging: false, timestamp: 0 };
}

export function gamepadState(pad: Gamepad): ControllerState {
  return { ...emptyState(), axes: [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0], buttons: pad.buttons.map(button => button.value), timestamp: pad.timestamp };
}

export function previewState(time: number): ControllerState {
  const buttons = Array<number>(18).fill(0);
  buttons[Math.floor(time / 1.1) % 18] = 1;
  buttons[6] = (Math.sin(time * 1.4) + 1) / 2;
  buttons[7] = (Math.sin(time * 1.4 + 2) + 1) / 2;
  return {
    axes: [Math.sin(time) * .65, Math.cos(time) * .65, Math.sin(time * .7 + 1) * .4, Math.cos(time * .7 + 1) * .4],
    buttons, gyro: [Math.cos(time) * 8, Math.sin(time) * 6, Math.cos(time * .8) * 5],
    accel: [Math.sin(time) * .12, .99, Math.cos(time) * .1],
    touches: [{ active: true, id: 1, x: (Math.sin(time) + 1) * 900, y: (Math.cos(time) + 1) * 420 }, { active: false, id: 2, x: 0, y: 0 }],
    touchSize: [1920, 942], battery: null, charging: false, timestamp: time * 1000,
  };
}
