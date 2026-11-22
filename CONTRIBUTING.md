# Contributing to PadScope

## Issues

Check the [troubleshooting guide](README.md#troubleshooting) and [existing issues](https://github.com/uzairdeveloper223/PadScope/issues), then choose a form:

- [Bug report](https://github.com/uzairdeveloper223/PadScope/issues/new?template=bug_report.yml): what happened, what you expected, and steps to reproduce.
- [Controller compatibility](https://github.com/uzairdeveloper223/PadScope/issues/new?template=controller_compatibility.yml): the physical controller, browser/OS, connection, and features you tested.
- [Feature request](https://github.com/uzairdeveloper223/PadScope/issues/new?template=feature_request.yml): the task you want to accomplish and how the proposed feature would help.

Include your browser/OS, controller model, connection, and steps to reproduce. Device IDs, screenshots, and PadScope JSON reports help with input problems. For compatibility results, say what you tested and what you could not test.

## Pull requests

Follow the [local setup instructions](README.md#run-locally), keep changes focused, and run:

```sh
npm test
npm run build
```

Explain the change and how you checked it. Add a regression for a reproducible bug when practical. For interface changes, check both themes and narrow layouts. For hardware changes, include the device and connection you tested. Asset URLs must also work under `/PadScope/`.

## Assets and licensing

Use redistributable, artist-made assets. Include the source and license, keep creator credits, and record modifications in the asset's attribution file. Update [third-party notices](THIRD_PARTY_NOTICES.md) when needed.

Code contributions use the [MIT license](LICENSE). Models, audio, and fonts have separate licenses.
