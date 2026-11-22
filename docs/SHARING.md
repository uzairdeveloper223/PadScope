# Sharing PadScope

PadScope's audience includes people checking controller drift, comparing input before and after maintenance, testing browser controller support, and experimenting with gyro input.

## Show a specific task

Use a short recording of the actual app: press a button, pull a trigger, move a stick, then show a saved controller-check report. A second clip can demonstrate the right-hand gyro grip and target range. Keep the device, browser, and USB/Bluetooth connection visible in the description.

For the repository's social preview, use an actual app screenshot with the PadScope logo and a short title. GitHub recommends a 1280 × 640 PNG/JPG/GIF under 1 MB. Upload it in **Repository Settings → General → Social preview**. Keep text and controls legible when the image is reduced.

## Suggested introduction

> I built PadScope, an open-source controller workbench that runs in the browser. It shows live input on a 3D PS5 Controller model and guides you through resting-stick, edge-sweep, trigger, and button checks. You can save reports to compare later. Supported controllers also expose gyro, touch, rumble, and lightbar tools through desktop Chrome/Edge's WebHID access. There is a joystick/gyro target range too. I'd like feedback on the guided check and compatibility results for other controllers.
>
> Try it: https://uzairdeveloper223.github.io/PadScope/
>
> Code and compatibility reports: https://github.com/uzairdeveloper223/PadScope

Adapt the introduction to the feature shown in the recording. For a web-development audience, mention TypeScript, Three.js, Gamepad API, WebHID, and static hosting. For controller users, lead with live readings and saved checks.

## Follow up on results

- Pin PadScope in your GitHub profile's featured repositories so profile visitors can find it.
- Share a demo where people already discuss controller testing, repair, gyro controls, or browser hardware APIs. Follow the community's posting rules and ask a specific question.
- Link compatibility feedback to the [controller result form](https://github.com/uzairdeveloper223/PadScope/issues/new?template=controller_compatibility.yml). Record exact device/connection results in the documentation after review.
- Publish a release when there is a useful milestone, with a short list of changes and the live-app link. Follow up with people who reported the issues it resolves.

## Research sources

Reviewed on 22 November 2026:

- [GitHub: repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics) explains discovery through purpose, subject, and language topics; repositories can have up to 20.
- [GitHub: README files](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) recommends explaining the purpose, usefulness, getting started, help, and maintainers.
- [GitHub: contribution guidelines](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors) describes where contribution guidance appears for visitors.
- [GitHub: social previews](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview) provides image format, size, and upload guidance.
- [Open Source Guides: finding users](https://opensource.guide/finding-users/) recommends a clear message, a consistent home URL, relevant communities, and useful feedback.
