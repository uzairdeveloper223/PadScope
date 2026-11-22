# Guided controller check

PadScope turns browser-visible input into a repeatable check: warm up the axes, record five seconds hands off, sweep both stick edges, pull/release the triggers, and press/release the exposed buttons. The results describe the readings and the coverage observed during that check. An untested control is not labeled broken.

## Use it

1. Connect your controller, focus PadScope, and press a button. Exit simulated preview.
2. Open **Controller check** beneath the workbench. With Gamepad input, record USB, Bluetooth, or wireless receiver if known. HID transport is filled in from the decoded reports.
3. Add useful notes: firmware, active controller profile, trigger-stop setting, remapping software, or the symptom you noticed.
4. Select **Start check**. Move both sticks in all directions and release them, then continue through the instructions. Advance each step explicitly.
5. Use **Repeat step** to clear the current step. **Skip step** and **Finish early** retain partial evidence with explicit coverage.
6. Review the raw measurements. A verified, stable resting capture can suggest a local radial deadzone. **Try suggested deadzone** applies it to PadScope only.
7. **Save locally** keeps up to ten checks in this browser. Select one to review it, or return to **Latest check**. Download JSON/text or use **Print / save PDF** for an independent copy.

Closing the check, hiding the page, or losing focus pauses capture. An incomplete hands-off window restarts when resumed; a completed one is preserved. Trigger/button cycles cannot cross a pause. A different live input source ends an active check, keeping the evidence collected so far. Reconnect the original source to resume after input loss, or finish early and start a new check.

## Input and sampling

Input is taken **before PadScope center correction and deadzone**:

- **Sony HID:** stick bytes normalized to `[-1, 1]`, trigger bytes normalized to `[0, 1]`, and decoded button states. USB/Bluetooth comes from the report parser.
- **Standard Gamepad:** the first four axes and exposed button values, using the browser's standard positional mapping.
- **Unmapped Gamepad:** the first four axes and raw button indices. Axis pairs are named `Axes 0/1` and `Axes 2/3`; trigger roles are not inferred. Absent stick pairs and unknown triggers remain unavailable.

A manually recorded connection belongs to the selected Gamepad source. Repeated checks on that source keep the selection; switching to a different Gamepad resets it to **Not recorded**. A decoded HID transport does not become a manually recorded Gamepad transport.

This is not necessarily unfiltered hardware data. Firmware, controller profiles, remapping software, OS drivers, and browser processing can change the values first. In particular, the inspected Chromium implementation can sanitize initially held axes/buttons to zero until they have reported a resting value. Warm-up requires each exposed stick axis to vary by at least `0.25` and subsequently be observed within `±0.20`; merely seeing a constant nonzero input does not verify it. Failed verification can be skipped, but disables the resting deadzone suggestion.

The existing animation-frame input loop feeds the check. Observations are accepted at least 16 ms apart, including repeated values. This measures how long a resting value persists rather than discarding unchanged timestamps. The browser/display may provide fewer observations. A gap over 250 ms or backwards sampling time pauses capture. A ten-minute active-capture limit bounds the session.

Reports record browser observations, observed timestamp changes, and accumulated active sampling time. **Neither timestamp changes nor observation count is a hardware polling-rate or end-to-end latency measurement.** A five-second capture uses wall-clock time across uninterrupted accepted observations, not a fixed count.

## Hands-off measurements

For each raw stick point `(xᵢ, yᵢ)`:

| Field | Calculation |
| --- | --- |
| Mean X/Y | Arithmetic mean of each axis |
| Radius | `rᵢ = √(xᵢ² + yᵢ²)` |
| Mean radius | Mean of `rᵢ`; distinct from the radius of the mean point |
| P95 radius | Sort radii; select the nearest-rank observation at `ceil(0.95 × n) - 1` |
| Peak radius | Largest observed radius |
| Jitter RMS | `√mean((xᵢ − meanX)² + (yᵢ − meanY)²)` |
| Above 5% reference | Fraction of observations with radius strictly greater than `0.05` |
| P95 after saved centers | P95 after PadScope's existing per-axis center normalization, with deadzone set to zero |

Percentages express fractions of the normalized unit radius. Raw diagonal radius can exceed 100% for square-shaped outputs. **The 5% reference is a PadScope comparison aid, not a manufacturer fault tolerance.** “Above 5% reference” describes the measurement without diagnosing its cause.

A capture is considered stable enough for a suggestion only when the mean-point radius is at most `0.35` and every observation is within radial distance `0.06` of that mean. These are conservative PadScope capture guards, not hardware specifications. An unstable capture says **Repeat hands off**. A partial or unverified window keeps its readings but cannot suggest a deadzone.

### Local deadzone suggestion

For each complete, verified, stable stick capture:

```text
suggestion = round up to a whole percentage point(P95 after saved centers + 0.01)
```

The 1 percentage-point margin allows some movement beyond the sampled P95. Suggestions above PadScope's 30% slider maximum are withheld. The shared radial deadzone takes the largest valid suggestion across the exposed stick pairs; every exposed pair must have a usable capture. The centers saved at the start of the check are recorded and used throughout. Applying a suggestion requires the same live source and unchanged saved centers, and a finished check.

This is a starting point for local filtering, not a guaranteed cure. Raising deadzone sacrifices small-input response. It changes PadScope's displayed model and aiming; it does not alter controller firmware, OS settings, or another game's deadzone. Raw report measurements stay intact.

## Stick edges and circularity

Each stick's angle is split into **24 equal sectors**. Points inside radius `0.5` do not count toward edge coverage. For each covered sector, record the largest observed radius. All 24 sectors are required for “full coverage.” X/Y minima and maxima are also recorded.

**Unit-circle deviation**, displayed as a percentage, is:

```text
100 × mean(abs(sectorPeakRadius − 1))
```

For partial coverage, this is explicitly a partial-outline measurement. It is not an area error and does not compare sensor mechanics. The reported shape can be circular, square, clipped, or profile-shaped. A square outline can be intentional. A shallow sweep can also produce large deviation. PadScope does not label a controller faulty from this number.

The plots use the reported axis directions (`+X` right, `+Y` down). The dashed ring is radius 1. Green/orange arcs show each sector's recorded peak radius, and the dot shows live raw input while the original source remains available.

## Triggers

A full observed trigger cycle requires:

1. Released input `≤0.05`.
2. Full pull `≥0.95`.
3. Released input `≤0.05` again.

An initial held pull is not counted. A pause breaks continuity; a pull before a pause and a release afterward cannot become a cycle. Reports retain minimum, maximum, hands-off mean, completed cycles, and whether values strictly between `0.02` and `0.98` were observed.

Intermediate values indicate reported analog variation, not force or millimeters of physical travel. Fast pulls may miss intermediate observations; digital triggers may expose none. Trigger stops, profiles, and driver behavior can affect endpoint coverage. Partial travel is not labeled failure. Unmapped Gamepad input does not assign trigger meaning to arbitrary indices.

## Buttons

Each exposed button gets a separate ledger. Press uses `≥0.55`; held input remains held at `≥0.35`, adding hysteresis. Only a fresh press followed by its observed release counts as complete. Initial held input is marked but not credited as a press. Pause/resume baselines held states again.

For controls physically absent or intercepted by the OS, the user may mark **Unavailable on this controller** during the button step. This is explicitly a user exclusion, never automatic evidence of a fault or a successful press. Reported press counts are observations, not a mechanical bounce diagnosis.

## Saved reports and comparison

Reports include schema version, start time, browser user agent, device identifier/name, API/mapping, connection, exposed input counts, starting calibration, notes, thresholds, finished/skipped steps, interruptions, sampling counts, and measurements. The storage key is `padscope:health-history`. History is limited to ten reports; invalid or oversized saved data is ignored. Storage failure leaves the current session and downloads usable.

Comparison requires matching device key, input API/mapping, known recorded connection, browser user agent, exposed input counts, and saved center correction. Only complete, verified, stable resting captures yield P95 differences, expressed in **percentage points**. Deadzone at capture may differ because measurements are taken before that filter. Firmware, profiles, remapping, and physical-device identity should also be matched manually and recorded in notes. Checks with “Not recorded” connection cannot be compared automatically; record it before testing when you know it.

Browser identifiers can identify a product/slot rather than a unique physical controller. Session source tokens prevent combining HID and Gamepad data or different selected slots during active capture; they are not serial numbers. Comparing different units of the same product requires interpreting the recorded test conditions accordingly.

Everything stays local. There is no server, analytics, upload, or remote diagnostics endpoint. Clearing site data removes saved checks. Downloaded reports remain independent of browser storage. Print includes recorded conditions and measurements.

## Research and design decisions

Sources inspected **22 November 2026**. Measurements and implementation were written for PadScope; no tester source code or third-party imagery was copied into this feature.

| Source | What it informed |
| --- | --- |
| [W3C Gamepad specification](https://w3c.github.io/gamepad/) | Normalized axes/buttons, standard positional mapping, and browser-visible input scope |
| [MDN: Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [timestamp](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/timestamp), [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) | Animation-frame sampling, last-update timestamps, and background-page limitations; documentation also checked through Context7 |
| [Chromium `GamepadPadStateProvider`](https://github.com/chromium/chromium/blob/2ef21ead8cf5ba3ce6202d7e8cb5cb41450e605e/device/gamepad/gamepad_pad_state_provider.cc) | Initial held-input sanitization; pinned source motivates warm-up and verified-axis labels |
| [Microsoft: Getting started with XInput](https://learn.microsoft.com/en-us/windows/win32/xinput/getting-started-with-xinput) | Different games/controllers use different deadzone choices; avoid a universal hardware fault threshold |
| [PlayStation: DualSense Edge profiles on PC](https://www.playstation.com/en-us/support/hardware/set-up-edge-pc/) | Stick curves, deadzones, and trigger settings are profile-dependent; capture notes and avoid interpreting endpoints as physical travel |
| [GamePadTestLab testing methodology](https://www.gamepadtestlab.com/testing-methodology) | Timed resting statistics, recorded conditions, and distinguishing browser observations from hardware polling/latency |
| [Simplified Tools gamepad tester](https://www.simplified.tools/test_gamepad) | User-facing live stick/trigger/button inspection and test discoverability |
| [JackWind: What the browser Gamepad API can—and cannot—tell you about controller health](https://dev.to/jackwind/what-the-browser-gamepad-api-can-and-cannot-tell-you-about-controller-health-51ph) | Repeated hands-off observations rather than diagnosing drift from one reading |

## Verification

`tests/health-check.test.ts` checks known numeric outcomes, motion verification, interrupted resting windows, source isolation, preserved partial evidence, circular/square sweep coverage, trigger continuity, held-button baselining, unmapped inputs, report snapshots, like-for-like comparison, and corrupt/unavailable storage. `npm test` and `npm run build` are required checks.

Browser rendering, printing layout, and real-controller feel are manual user checks. Try the flow on HID and Gamepad input, both themes, narrow/desktop layouts, interrupted focus, a held trigger/button at entry, skipped controls, saved checks, comparison, and the three export actions.
