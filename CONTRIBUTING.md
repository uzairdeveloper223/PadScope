# Contributing to PadScope

PadScope is a browser-based controller workbench maintained by [Uzair Mughal](https://github.com/uzairdeveloper223). Useful contributions include reproducible fixes, controller compatibility results, clearer documentation, and accessibility improvements.

## Report a problem or a controller result

Check the [troubleshooting guide](README.md#troubleshooting) and [existing issues](https://github.com/uzairdeveloper223/PadScope/issues), then choose a form:

- [Bug report](https://github.com/uzairdeveloper223/PadScope/issues/new?template=bug_report.yml): what happened, what you expected, and steps to reproduce.
- [Controller compatibility](https://github.com/uzairdeveloper223/PadScope/issues/new?template=controller_compatibility.yml): the physical controller, browser/OS, connection, and features you tested.
- [Feature request](https://github.com/uzairdeveloper223/PadScope/issues/new?template=feature_request.yml): the task you want to accomplish and how the proposed feature would help.

For hardware issues, include USB/Bluetooth/receiver connection and vendor/product IDs if known. A PS5-shaped shell does not establish the report protocol. Describe observed results for the specific device and connection; distinguish untested features from features that failed.

Screenshots, PadScope input JSON, guided-check reports, and short report samples can help reproduce a problem. Calibration affects PadScope only, so include the active center/deadzone settings when relevant.

## Develop locally

Use Node.js 24 LTS and npm:

```sh
git clone https://github.com/uzairdeveloper223/PadScope.git
cd PadScope
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173/`. No API keys or environment variables are needed. See the [project structure](README.md#project-structure-and-checks) for the main modules.

Keep changes focused and follow nearby TypeScript and CSS patterns. Add a regression when it captures a meaningful failure, such as report offsets, source changes, measurement continuity, or input edges.

## Verify a change

Run:

```sh
npm test
npm run build
```

The build checks TypeScript and creates `dist/`. `npm run preview` serves that output. Asset URLs must work under `/PadScope/`, as well as locally.

For interface changes, check both themes and desktop/narrow layouts. For controller or motion changes, record the browser, OS, device, connection, and actions tested. Check resting motion, centering, all three rotation axes, and input loss where relevant. For audio changes, check gesture startup, volume, and focus/visibility behavior.

In your pull request, explain the change and list verification results. Record manual or hardware checks as tested or untested so reviewers know the evidence available. Link a related issue when there is one.

## Documentation and assets

Keep user-facing instructions consistent with the actual controls and capability labels. Measurement descriptions belong in [the controller-check methodology](docs/HEALTH_CHECK.md); HID layouts and evidence belong in [the protocol notes](docs/PROTOCOL.md).

Use redistributable, artist-made assets with a documented source and compatible license. Preserve bundled licenses, creator credits, and provenance/hashes when changing assets. Document modifications in the relevant attribution file and update [third-party notices](THIRD_PARTY_NOTICES.md) where needed.

Contributed code is covered by the project's [MIT license](LICENSE). Models, audio, and fonts retain their separate licenses.
