import { element, text } from './ui.ts';

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other';
type ThemePreference = 'system' | 'light' | 'dark';

export function detectPlatform(agent: string, platform: string, touchPoints: number): Platform {
  if (/Android/i.test(agent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(agent) || /Mac/i.test(platform) && touchPoints > 1) return 'ios';
  if (/Windows/i.test(agent)) return 'windows';
  if (/Mac/i.test(agent)) return 'macos';
  if (/Linux/i.test(agent)) return 'linux';
  return 'other';
}

export function platformHelp(platform: Platform): string {
  switch (platform) {
    case 'windows': return 'On Windows, plug in a USB data cable or pair through Settings → Bluetooth & devices. Open this page in Chrome or Edge for advanced hardware access. If a controller is missing, close other controller tools and try again.';
    case 'macos': return 'On macOS, plug in a USB data cable or pair in System Settings → Bluetooth. Use Chrome or Edge for advanced hardware access; Safari can still read supported buttons and sticks.';
    case 'linux': return 'On Linux, connect by USB or Bluetooth. Chrome or Edge can access advanced HID features when your user has permission to open the controller’s hidraw device. The Linux setup below explains that permission.';
    case 'android': return 'On Android, pair in Settings → Connected devices → Pair new device, or use a supported USB adapter. Press a button while this page is active. Browser Gamepad support varies; touchpad, motion, and lightbar access need desktop Chrome or Edge.';
    case 'ios': return 'On iPhone or iPad, pair in Settings → Bluetooth, then press a controller button while this page is active. Supported buttons and sticks use the Gamepad API. Touchpad, motion, and lightbar access need desktop Chrome or Edge.';
    default: return 'Connect a controller with a USB data cable or Bluetooth, then press a button with this page focused. Advanced touch, motion, and lightbar tools need a browser with WebHID support, such as desktop Chrome or Edge.';
  }
}

export function setupEnvironment(hidAvailable: boolean): string {
  const platform = detectPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  const mobile = platform === 'android' || platform === 'ios';
  document.documentElement.dataset.platform = platform;
  text('platform-help', platformHelp(platform));
  element('linux-help').hidden = platform !== 'linux';
  element('mobile-guidance').hidden = !mobile;
  if (mobile) text('mobile-guidance-copy', 'Pair a controller to test supported buttons and sticks, or try the preview. Touchpad, motion, and lightbar tools need desktop Chrome or Edge.');
  element('connect-button').hidden = !hidAvailable;
  element('compatibility-button').hidden = hidAvailable;
  element('fullscreen-button').hidden = typeof element('model-stage').parentElement!.requestFullscreen !== 'function';
  const touchInput = window.matchMedia('(pointer: coarse)');
  const gestures = () => {
    const instruction = touchInput.matches ? 'Drag to rotate · Pinch to zoom' : 'Drag to rotate · Scroll to zoom';
    text('model-gestures', instruction);
    element('model-stage').setAttribute('aria-label', `Interactive PS5 Controller model. ${instruction}. Button input is also shown in the button strip below.`);
  };
  touchInput.addEventListener('change', gestures);
  gestures();
  const hint = !window.isSecureContext ? 'Open PadScope over HTTPS or localhost to enable controller access. The preview is available here.'
    : typeof navigator.getGamepads !== 'function' && !hidAvailable ? 'This browser does not expose controller input. Try the preview, or open PadScope in a browser with Gamepad support.'
    : mobile ? 'Pair your controller over Bluetooth or use a compatible USB adapter, then press a button. You can also try the preview.'
    : hidAvailable ? 'Connect by USB or Bluetooth, then press any button. Connect hardware to enable touch, motion, and lights.'
    : 'Buttons and sticks use the Gamepad API here. Use desktop Chrome or Edge for touch, motion, and lightbar access.';
  text('connection-hint-copy', hint);
  const helpLink = element<HTMLAnchorElement>('compatibility-button');
  helpLink.textContent = mobile ? 'Mobile connection help' : 'Connection help';
  return hint;
}

export function setupTheme(): void {
  const selector = element<HTMLSelectElement>('theme-select');
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference: ThemePreference = 'system';
  try {
    const saved = localStorage.getItem('padscope:theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Theme still works without browser storage. */ }
  selector.value = preference;
  const apply = () => {
    const dark = preference === 'dark' || preference === 'system' && system.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = dark ? '#142b38' : '#163747';
    window.dispatchEvent(new Event('padscope-theme'));
  };
  selector.addEventListener('change', () => {
    preference = selector.value as ThemePreference;
    try { localStorage.setItem('padscope:theme', preference); } catch { /* Session-only preference. */ }
    apply();
  });
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  apply();
}
