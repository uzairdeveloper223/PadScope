# Controller protocol and evidence notes

PadScope reads standard controls through the browser Gamepad API and compatible Sony HID reports through WebHID. The visible PS5 Controller model is a presentation choice; parsing follows the device's vendor/product ID and actual reports.

## Supported layouts

`src/controller/protocol.ts` recognizes Sony vendor `054c`, products `05c4` / `09cc` as DS4 and `0ce6` / `0df2` as DualSense. Full USB reports use ID `01`; full Bluetooth reports use `11` (DS4) or `31` (DualSense). Minimal Bluetooth input exposes controls without inventing unavailable motion/touch/battery measurements.

WebHID `inputreport.data` **excludes the report ID**. USB data is 63 bytes; full Bluetooth data is 77 bytes. Bluetooth input is checked with the `A1` prefix and CRC32; output uses the `A2` prefix. `receiveFeatureReport()` includes the report ID, so its calibration offsets follow a different convention.

DS4 USB data offsets, excluding the report ID:

| Field | Offset |
| --- | --- |
| Four stick axes | 0–3 |
| Buttons / D-pad hat | 4–6 |
| L2 / R2 | 7–8 |
| Three gyro int16 values | 12–17 |
| Three acceleration int16 values | 18–23 |
| Battery / cable status | 29 |
| Touch packet count | 32 |
| First packet's contacts | 34, 38 |

When multiple touch packets are present, PadScope uses the newest complete packet. DS4 battery levels 0–9 are coarse intervals represented by their midpoints, 10 is full, and plugged level 11 is the full state; invalid/error values remain unknown.

## Evidence and limitations

Twenty-four 64-byte USB reports were captured from a physical PS5-shell controller identifying as `054c:09cc`. A representative report is embedded in `tests/protocol.test.ts`; it decodes gyro `[27, 8, 6]`, acceleration `[-1028, 8347, 3161]`, inactive contacts, and plugged battery around 95%.

The report structures were cross-checked against the Linux [hid-playstation driver](https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c), particularly `dualshock4_input_report_common`, USB/Bluetooth wrappers, and `dualsense_input_report`. This is a protocol reference; Linux driver source is not bundled into the application.

Synthetic regressions cover button/touch offsets, invalid battery states, Bluetooth checksums and truncation, and independent output fields. Actual assets are loaded in the separate game regressions. Hardware verification of other IDs and transport combinations remains device-specific; protocol implementation does not establish universal compatibility.

## Motion and grip frames

Sony sensor axes map into the controller model as **`(x, -z, y)`**. `MotionTracker` integrates quaternion rotations about local axes, applies measured/manual sensor scales and bias, and learns small residual gyro offsets during confirmed rest. Missing/repeated/invalid updates cannot accumulate rotation.

The model's resting reference starts fresh on connection. Gyro yaw has no compass reference. Grip centering for the range and inspection is independent and session-local: the controller's left handle is model-local `-X`, while acceleration establishes screen-up. The centered blaster uses source `-Z` for its barrel and `+Y` for up.

The range projects grip-relative forward into the camera view and rejects offscreen/backward shots. Inspection transforms the entire relative quaternion without aim scaling or clamping. Neither system estimates physical translation.
