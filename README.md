<p><img src="./public/favicon.svg" alt="PadScope logo" width="80" height="80" /></p>

# PadScope

[![Build and deployment](https://github.com/uzairdeveloper223/PadScope/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/uzairdeveloper223/PadScope/actions/workflows/pages.yml)
[![Live app](https://img.shields.io/badge/live_app-GitHub_Pages-163747)](https://uzairdeveloper223.github.io/PadScope/)
[![Code license: MIT](https://img.shields.io/badge/code_license-MIT-163747)](LICENSE)

**A 3D gamepad tester and controller workbench for the browser.** Check stick drift, test buttons and triggers, save guided reports, and see live input on an artist-made PS5 Controller model. Use the same controller for joystick or gyro target practice and hands-on blaster inspection.

**[Open PadScope →](https://uzairdeveloper223.github.io/PadScope/)** · [Compatibility](#browser-and-device-compatibility) · [Controller check](#check-your-controller) · [Development](#development-and-verification) · [Contributing](CONTRIBUTING.md)

Built with TypeScript, Three.js, and Vite. Controller readings and preferences stay on your device; the application has no backend or analytics. The code is MIT-licensed, with separate licenses for the credited models, music, and fonts.

## Try it in a minute

1. [Open the live app](https://uzairdeveloper223.github.io/PadScope/), connect a controller over USB or Bluetooth, and press a button with the page focused.
2. Watch the sticks, triggers, and buttons respond. For supported motion, touch, battery, rumble, and lights, use **Connect hardware** in desktop Chrome or Edge.
3. Open **Controller check**, select **Start check**, and follow the five steps. Save or download a report to compare later.

Without a controller, select **Try a preview** to explore the workbench, or play the target range with a pointer or keyboard. Guided checks and blaster inspection require live controller input; inspection also requires motion.

## Features

- **Live 3D controller:** animated buttons, hinged triggers, smooth stick tilt with fading direction arrows, touch contacts, and motion; drag to orbit, zoom, switch views, and customize the model's shell and lightbar.
- **Stick testing and calibration:** raw/calibrated plots, trails, center calibration, radial deadzone, motion zero, and resting gyro-offset correction.
- **Guided reports:** five-second hands-off measurements, 24-direction stick sweeps, trigger cycles, button press/release coverage, a measured local deadzone suggestion, saved comparisons, and JSON/text/PDF exports.
- **Input and hardware tools:** trigger pressure, button history, JSON input export, compatible touchpad/gyro/acceleration reports, approximate battery level, report rate, independent rumble motors, and lightbar commands.
- **Target range and inspection:** 60-second moving-target rounds, score/accuracy/streaks, three blasters, joystick or grip-relative gyro aiming, remappable controls, and an independent 1:1 rotation view with center, freeze/resume, and zoom.
- **Workspace preferences:** desktop/mobile layouts, system-aware light/dark themes, simulated preview, and separate range/inspection music with range sound effects and remembered audio controls.

## Connect a controller

1. Connect with a **data-capable USB cable**, or pair through your operating system's Bluetooth settings.
2. Focus PadScope and press a controller button. Supported buttons and sticks appear through the Gamepad API.
3. In **desktop Chrome or Edge**, select **Connect hardware** and choose a supported controller. This grants WebHID access for compatible motion, touch, battery, light, and rumble reports.
4. Check the live status labels. A feature is usable only when the controller and browser expose it.

Previously granted HID devices are reopened when possible. **Disconnect hardware** closes PadScope's HID connection; browser site settings control the saved permission. If multiple gamepads are present, use the active-controller selector.

### Browser and device compatibility

| Environment | Buttons / sticks | Advanced HID tools |
| --- | --- | --- |
| Desktop Chrome / Edge | With a browser-supported controller | With WebHID, permission, and a supported report layout |
| Desktop Firefox / Safari | Where the browser supports the connected gamepad | Unavailable without WebHID |
| Android / iPhone / iPad | Depends on browser, OS, controller, and connection | Use desktop Chrome / Edge |
| No controller | Simulated workbench preview and pointer/keyboard range practice | Preview does not send hardware output |

The HID chooser currently recognizes these Sony vendor/product IDs:

| Vendor | Product | Protocol family |
| --- | --- | --- |
| `054c` | `05c4`, `09cc` | DualShock 4 |
| `054c` | `0ce6`, `0df2` | DualSense / DualSense Edge |

Compatible third-party controllers may use these IDs. Physical appearance does not establish protocol support. Other controllers can use Gamepad input when the browser exposes it; unmapped gamepads show raw button indices and the first four axes.

USB input was checked against reports from a PS5-shell controller identifying as `054c:09cc`. The code includes USB and Bluetooth pathways for both protocol families; this is **not a claim that every device/transport combination has been physically verified**. See [protocol notes](docs/PROTOCOL.md).

Rumble depends on HID output or browser Gamepad haptics. Adaptive-trigger effects and microphone controls are not implemented. The OS may intercept the PS button. Battery is an estimate, report rate is not latency, and the lightbar's current color has no readback.

### Linux HID permissions

If standard Gamepad input works but **Connect hardware** fails, check access to the controller's `/dev/hidraw*` node:

```sh
lsusb
udevadm info --attribute-walk --name=/dev/hidrawX
```

Replace `hidrawX` with the controller node. On a desktop using systemd/logind, create `/etc/udev/rules.d/70-padscope.rules` with a rule scoped to your device. For the `054c:09cc` controller:

```udev
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="054c", ATTRS{idProduct}=="09cc", TAG+="uaccess"
```

Substitute the product ID reported by your controller, then reload the rules:

```sh
sudo udevadm control --reload-rules
```

Unplug and reconnect the controller, then retry **Connect hardware**. The rule grants the active local session access to that device. Browser packaging or sandboxing may also affect access. Bluetooth devices can expose different parent attributes; inspect their actual node instead of assuming the USB rule applies.

## Check your controller

Open **Controller check** below the live inputs and select **Start check**. Warm up both sticks, keep hands off for five seconds, sweep their outer edges, pull/release the triggers, then press/release each exposed button. Each step advances when you choose; you can repeat, skip, or finish early.

Results show resting offset, P95 radius, jitter, direction coverage, trigger endpoints/cycles, and actual button pairs. Untested or unavailable controls stay explicit. The check uses input **before PadScope calibration**; a stable, verified resting capture can suggest a radial deadzone for PadScope only.

Record connection and profile/firmware notes, save up to ten checks locally, and compare resting input under matching conditions. **Download JSON**, **Download text**, and **Print / save PDF** keep independent copies. Preview cannot produce a check. Focus/input loss pauses capture; a source change keeps the collected evidence and ends the active check.

See the [measurement method and research sources](docs/HEALTH_CHECK.md). Reference percentages describe browser-visible observations, not manufacturer fault tolerances or hardware latency.

## Calibrate your baseline

- **Calibrate centers:** release both sticks and keep the controller still while PadScope samples their resting positions.
- **Radial deadzone:** filter small movements around the calibrated center. Raw readings remain visible for comparison.
- **Motion zero:** hold your resting pose still for about one second to sample gyro bias and recenter the displayed controller.
- **Reset:** restore default centers, deadzone, and motion calibration for the active device.

Calibration changes **PadScope's readings, model, and aiming only**, not controller firmware or other games. Centers and gyro bias are remembered locally for the device key. Motion pose and blaster grip references are session-local. Changing motion zero or resetting calibration requires centering the range/inspection grips again.

## Target range

Open **Take it to the range**, choose a blaster and aiming mode, then select **Start 60-second round**.

| Action | Controller default | Pointer / keyboard |
| --- | --- | --- |
| Aim | Right stick | Point at the field; arrows / WASD when focused |
| Fire | R2 | Click / tap, Space, or the Fire button |
| Center | Square | C or Center aim / grip |
| Pause / resume | Options | P, Escape, or Pause / Resume |

Keyboard shortcuts require focus on the range. Choose the left stick if preferred, adjust sensitivity/inversion, and use the mapping selects or **Bind press** to remap controller actions. Release all buttons before binding. Duplicate assignments swap automatically. Pause a running round to edit aiming settings; audio controls remain available.

Fire is **one shot per press**, with release required between shots and a 160 ms rate limit. Ordinary targets earn 100 points, small targets 150, and bullseyes add 50. Consecutive hits add a capped streak bonus; misses reset the streak.

The round pauses when closed, out of view, unfocused, or interrupted by delayed updates or an input-source change. Gyro motion loss also pauses it. Resume explicitly when ready.

### Right-hand gyro-gun grip

1. Connect hardware and confirm live motion is available.
2. Select **Gyro gun · right-hand grip**.
3. Hold the controller sideways in your **right hand**, with its **left handle pointing toward the center of the screen**.
4. Keep still and select **Center grip**. Aim by moving that handle; fire with your mapped control.

Recenter after changing grip or if yaw drifts. Aiming away from the field or backward prevents shots. The range's grip center is independent of the workbench model's resting pose.

## Blaster in hand

Open **Blaster in hand**, select Compact, Carbine, or Longshot, and center the same right-hand, left-handle-forward grip. The barrel starts pointing into the screen. You can then turn, tilt, and roll through every angle with **1:1 relative rotation**.

- **Square / C:** center grip.
- **Options / F:** freeze or resume rotation.
- Use **Model zoom** to examine the model and the mapping selects to change controller controls.

Keyboard shortcuts require focus on the inspection view. Freeze holds the shown angle; resume follows your current physical grip. Closing, scrolling out of view, or losing focus freezes inspection. Changing input source, losing motion, or resetting motion calibration clears centering.

Inspection tracks **rotation, not physical position**. It has no aim sensitivity or offscreen clamp and uses its own grip reference. Simulated preview inputs cannot drive it; live motion is required.

## Music and effects

- **Range:** “Space Jazz” by Kevin MacLeod, with Kenney sci-fi shot, hit, bullseye, and round sounds.
- **Inspection:** “Floating Cities” by Kevin MacLeod.

Each area has a **Background music** switch. Music volume is shared across both areas; the range also has separate **Sound effects** and effects-volume controls. Preferences are remembered in this browser.

Audio starts after a page interaction, not from a hardware button alone. If the browser blocks it, click a music control to retry. Music fades when an area closes or leaves view; all audio becomes silent while the page is hidden or unfocused. If both areas are visible, inspection music takes priority so the soundtracks do not overlap.

Tracks and effects are bundled and served locally. [Audio attribution and full licenses](public/audio/ATTRIBUTION.md) include the original sources and web-encoding changes.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No input | Use a data cable, press a button with the page focused, and confirm the OS recognizes the controller. |
| Controller missing from HID chooser | Use desktop Chrome / Edge on HTTPS or localhost; confirm the supported IDs and close other controller tools. |
| HID opens but no advanced readings arrive | Reconnect, try USB, check OS permissions, and confirm that this device sends a supported full report. |
| Model/range cannot load | Enable hardware acceleration and check that the site serves its bundled models and textures. Close/reopen the area to retry a load failure. |
| Gyro aim or inspection unavailable | Exit preview, connect real HID motion, and center your grip. |
| Motion needs lining up | Hold still and use Motion zero, then center the relevant grip again. |
| Controller check pauses | Keep the check open and PadScope focused; resume explicitly. Incomplete hands-off captures restart. |
| A check button stays untested | Release it first, then press/release again; the OS may intercept system buttons. Mark unavailable only when appropriate. |
| No deadzone suggestion | Complete a stable hands-off window and verify the exposed stick axes in warm-up; repeat if you touched the sticks. |
| No music | Check switches/volumes, interact with a page control, and keep the area visible and the page focused. |
| Rumble or color command has no visible result | Check capability labels and the physical device; an accepted command is not hardware readback. |
| Preferences are not remembered | Browser storage may be disabled; settings still work for the session. |

## Development and verification

### Run locally

Use **Node.js 24 LTS** and npm.

```sh
git clone https://github.com/uzairdeveloper223/PadScope.git
cd PadScope
npm ci
npm run dev
```

Open the local URL printed by Vite, normally **http://localhost:5173/**. No API keys, environment variables, or separate asset downloads are required.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run the Node regression tests |
| `npm run build` | Check TypeScript and produce `dist/` |
| `npm run preview` | Serve an existing production build, normally on port 4173 |

Use HTTPS or localhost for controller access. Opening `index.html` directly as a file does not run the application.

### Project structure and checks

```text
src/main.ts              Input selection, calibration, hardware tools, app wiring
src/controller/          Gamepad/HID state, Sony report parsing, motion tracking
src/health/              Guided checks, measurement math, saved reports, comparison
src/model.ts             Controller model articulation and framing
src/ui.ts, src/plots.ts   Readings, button history, plots
src/environment.ts       Browser/platform guidance and theme selection
src/game/                Range, shared assets, grip aiming, blaster inspection
src/audio.ts             Gesture-gated music and range effects
public/models/           Artist-made models, textures, attribution
public/audio/            Music, effects, attribution, Creative Commons licenses
tests/                   Node regressions using real GLB assets and report data
```

Run `npm test` and `npm run build` before contributing. The regression suite covers real-model orientation/hit detection/framing, gyro rest and axis behavior, report decoding/output checksums, grip rotation, trigger edges, settings, round scoring, and guided-check measurements/continuity/report storage. See [range and inspection implementation notes](src/game/README.md) and [controller check methodology](docs/HEALTH_CHECK.md).

Browser rendering, audio playback quality, and physical controller feel are manual checks. Test both themes, narrow/desktop layouts, centering and rotation on all three axes, freeze/resume, input loss, remapping, and asset loading under the deployment path. When reporting an issue, include browser/OS, USB or Bluetooth, device IDs, and reproduction steps. PadScope's JSON export can help explain the current readings.

## Contributing and feedback

Bug fixes, documentation improvements, accessibility work, and controller compatibility reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification, and asset attribution requirements.

- [Report a bug](https://github.com/uzairdeveloper223/PadScope/issues/new?template=bug_report.yml)
- [Share a controller compatibility result](https://github.com/uzairdeveloper223/PadScope/issues/new?template=controller_compatibility.yml)
- [Suggest a feature](https://github.com/uzairdeveloper223/PadScope/issues/new?template=feature_request.yml)

## GitHub Pages

The included [Pages workflow](.github/workflows/pages.yml) installs locked dependencies, runs tests, builds the site, and deploys `dist/` after pushes to `main`. Pull requests run checks without deploying.

In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions**. The deployment target for this repository is:

```text
https://uzairdeveloper223.github.io/PadScope/
```

`vite.config.ts` uses `base: './'` so scripts, fonts, models, textures, and audio resolve beneath the project path. The same `dist/` can be served by an HTTPS static host; no application server is needed.

## Credits and licensing

Created and maintained by **[Uzair Mughal](https://github.com/uzairdeveloper223)**.

**PadScope code:** [MIT](LICENSE), copyright © 2026 **Uzair Mughal**.

| Asset | Creator | License | Details |
| --- | --- | --- | --- |
| PS5 Controller | Taohid Animation | CC BY 4.0 | [Source, preparation, runtime changes, hash](public/models/ATTRIBUTION.md) |
| Blaster Kit 2.1 models and texture | Kenney | CC0 1.0 | [Source and bundled-file hashes](public/models/range/ATTRIBUTION.md) |
| “Space Jazz” and “Floating Cities” | Kevin MacLeod / incompetech.com | CC BY 4.0 | [Sources, encoding changes, hashes](public/audio/ATTRIBUTION.md) |
| Sci-fi Sounds 1.0 | Kenney | CC0 1.0 | [Sources and selected effects](public/audio/ATTRIBUTION.md) |
| Barlow and JetBrains Mono | Their respective font authors | SIL OFL 1.1 | [Third-party notices](THIRD_PARTY_NOTICES.md) |

Model and audio licenses are separate from the MIT code license. Keep their attribution and notices when redistributing PadScope. All bundled models and audio are sourced artist-made assets. See [third-party notices](THIRD_PARTY_NOTICES.md) for library and font licensing.

PadScope is an independent project and is not affiliated with Sony, the model artists, or the audio creators. PlayStation, DualShock, and DualSense are Sony trademarks.
