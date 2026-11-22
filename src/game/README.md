# Range and blaster inspection

`game.ts` connects a lazy-loaded 3D playfield to PadScope's current input. `aim.ts` holds joystick and grip-relative aiming; `input.ts` detects button edges with analog-trigger hysteresis; `round.ts` owns the 60-second timer and scoring; `targets.ts` moves and raycasts the actual target meshes; `weapon.ts` aims and articulates the selected blaster; `view.ts` loads the licensed assets and renders the scenes.

## Playing

Open **Take it to the range**, select an aiming mode, and start a round. Joystick mode accepts the selected calibrated stick; pointing/clicking or tapping the field and focused keyboard input also work. Fire requires a new press after release, with a 160 ms maximum shot rate. Hold-to-fire is not enabled. Small targets earn 150 points, ordinary targets 100, bullseyes add 50, and successive hits add a capped streak bonus. Misses reset the streak.

The timer pauses when the range closes, goes out of view, loses window focus, or stops receiving timely animation updates. Input-source changes pause the round and discard grip centering. Gyro mode also pauses when real motion data disappears. Resume explicitly; start/resume and control changes seed current button state so an already-held trigger cannot fire accidentally. Returning after focus/visibility loss baselines the first live input report, requiring release and a new press for controller actions. Centering and firing require an interactive, visible field. Settings can be edited while idle, paused, or finished.

## Right-hand gyro grip

Connect hardware for genuine sensor reports. Hold the controller sideways in the right hand, aiming its **left handle at the screen center**, and select **Center grip**. Live acceleration establishes screen-up; model-local `-X` establishes forward. Centering captures the quaternion neutral pose without changing the workbench motion reference. Subsequent local quaternion changes are transformed into this grip's screen basis, then projected using the playfield camera's field of view and aspect ratio. Offscreen or backward rays cannot shoot edge targets. Grip centering is session-local; sensitivity, inversion, stick choice, and button mappings are saved under `padscope:range`.

The motion tracker supplies calibrated, drift-compensated pose. Sensor yaw has no absolute compass reference; recenter as needed or after changing grip. If axes feel reversed on a particular third-party controller, use the inversion controls. Preview sensors/buttons do not drive or fire the game; pointer/keyboard practice remains available in joystick mode.

## Mapping and models

Fire defaults to R2, center to Square, and pause to Options. Select a button or use **Bind press**, releasing all buttons before pressing the desired control. Duplicate assignments swap the previous mapping. Generic gamepads use raw button indices.

The live controller replica shares geometry, materials, articulation, touch markers, and appearance with `ModelView`. Its grip-relative rotation is independent of the workbench view. The playfield renders an inset with the same WebGL renderer. The existing model's input articulation continues when the workbench is out of view. New target/prop assets load only when the range opens, are served locally, and retain their external texture paths under the relative Vite base URL.

Compact, Carbine, and Longshot blasters use Kenney's original models A, P, and E. A camera-relative weapon rig aims the real **-Z barrel** at the reticle's projected point; the +Z end is the stock. Shared `blasters.ts` loading caches originals and supplies separate scene instances to the range and inspector. Stick movement eases into the aim direction; gyro movement retains the centered grip's roll and points away naturally when aimed offscreen. Sensitivity and inversion are reflected in the visible aiming direction. Recoil returns to a separate resting quaternion, avoiding cumulative rotation. Each shot produces a muzzle flash and a tracer from the actual barrel-end geometry to the raycast impact. Kenney's targets have their colored face on -X; a +90° Y rotation faces them toward the player. `props.ts` keeps crate lids at +Y, turns latch fronts toward the camera, and grounds the transformed bounds. Hit rings, target carriage motion, and scene signage add feedback and orientation. The score strip remains visible in fullscreen. Range settings version 2 adds blaster selection and migrates existing version 1 mappings.

## Blaster inspection

`inspection.ts` runs the separate **Blaster in hand** tool. `inspection-pose.ts` captures an independent grip reference and transforms the full physical rotation into the blaster's -Z-forward/+Y-up basis. It never applies game sensitivity, inversion, reticle clamping, scoring, or offscreen aim rejection. `inspection-view.ts` renders a centered model and fits its enclosing sphere across zoom levels and screen sizes, so arbitrary rotation stays framed.

Center the right-hand, left-handle-forward grip before live inspection. Square centers and Options freezes/resumes by default; native mapping selects swap duplicate assignments. C and F work when the inspection stage is focused. Freezing holds the shown orientation; resuming follows the current physical orientation. Closing, moving the stage out of view, or losing focus freezes it. Input-source changes, lost real motion, and workbench motion resets discard the grip reference and require centering again. Selection, zoom, and mappings persist under `padscope:inspection`; grip references do not persist. Preview input cannot drive inspection. Only rotation is tracked, not physical translation.

The first returning live input report also baselines inspection's controller buttons, so a press held while hidden cannot silently center or resume it. Center/freeze controls require a visible, ready field and page focus.

## Audio

`src/audio.ts` owns a shared `WorkbenchAudio` instance. Each area's trusted click/key interaction unlocks Web Audio; controller reports do not unlock it. Opening a tool lazily creates its looping media element, and range interaction decodes seven local effects. Inspection's **Floating Cities** soundtrack takes priority over the range's **Space Jazz** when both areas are visible and enabled.

Separate music switches, shared music volume, and the range's effects switch/volume persist under `padscope:audio`. Music fades on area changes, and hidden/unfocused pages mute all audio. Closing the range also mutes effect tails. Shots select the blaster-specific sample and schedule hit/bullseye feedback; round start/result hooks use short cues. Individual effect-load failures preserve successfully decoded samples and retry on a later interaction. Playback failures show a recovery message. Original sources, adaptations, file hashes, and licenses are recorded in [audio attribution](../../public/audio/ATTRIBUTION.md), with visible artist credits beside each tool.

Credits: [Kenney Blaster Kit 2.1, CC0](../../public/models/range/ATTRIBUTION.md) and [Taohid Animation PS5 Controller, CC BY 4.0](../../public/models/ATTRIBUTION.md).

## Verification

Run `npm test` for aiming, input, scoring, model geometry, and inspection regressions. Run `npm run build` to check TypeScript and build production assets. Rendering, audio playback, and controller feel need browser testing.
