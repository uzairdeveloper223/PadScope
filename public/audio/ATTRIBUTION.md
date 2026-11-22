# PadScope audio

Audio is separately licensed from PadScope's MIT code. Files were downloaded from the creators' sources on 21 November 2026 and re-encoded for browser delivery.

## Background music — Kevin MacLeod

“Space Jazz” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/

“Floating Cities” Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/

| Use / bundled file | Original track | Source |
| --- | --- | --- |
| Range / `range-music.mp3` | Space Jazz, ISRC USUAN2100030 | [Creator's track page](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2100030&Search=Search) · [Original MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space%20Jazz.mp3) |
| Inspection / `inspection-music.mp3` | Floating Cities, ISRC USUAN1600018 | [Creator's track page](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600018&Search=Search) · [Original MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Floating%20Cities.mp3) |

Changes: complete tracks re-encoded to 128 kbps MP3 using FFmpeg, metadata removed, and files renamed. PadScope loops them at runtime and applies volume/fades. Credit and license are displayed beside the corresponding area. Full license: [CC-BY-4.0.txt](CC-BY-4.0.txt).

Original download SHA-256:

- Space Jazz: `51924be4565a2f101f4daa45998aa4c3577dab05ba5d1067ffb7bc57583ad503`
- Floating Cities: `e7365652410d1fbc8a14d87537855d625c1a5fa8b7de8c626f47c13256ef2ddd`

## Sound effects — Kenney

**Creator:** [Kenney](https://kenney.nl). **Pack:** [Sci-fi Sounds 1.0](https://kenney.nl/assets/sci-fi-sounds). **License:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

The original notice is retained in [KENNEY-LICENSE.txt](KENNEY-LICENSE.txt), with the full [CC0-1.0.txt](CC0-1.0.txt) legal text. Credit is voluntary under CC0 and displayed in the range.

| Bundled file | Original pack file | Use |
| --- | --- | --- |
| `shot-compact.mp3` | `Audio/laserSmall_001.ogg` | Compact shot |
| `shot-carbine.mp3` | `Audio/laserSmall_003.ogg` | Carbine shot |
| `shot-longshot.mp3` | `Audio/laserLarge_001.ogg` | Longshot shot |
| `hit.mp3` | `Audio/impactMetal_000.ogg` | Target hit |
| `bullseye.mp3` | `Audio/forceField_001.ogg` | Bullseye |
| `round-start.mp3` | `Audio/computerNoise_000.ogg` | Round start |
| `round-complete.mp3` | `Audio/computerNoise_003.ogg` | Round result |

Changes: effects converted to mono 96 kbps MP3 with metadata removed and files renamed. The round cues use the first 0.9 / 1.25 seconds of their originals, with 15 ms fade-in and 180 ms fade-out. Other effects retain their full source duration. PadScope applies runtime gain and a short hit-feedback delay.

Original source ZIP SHA-256: `119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04`.

## Bundled-file hashes

| File | SHA-256 |
| --- | --- |
| `range-music.mp3` | `d918530a2f6708c86c25437e932fad8da9282895bb0ebcfd9203b3f39c4b06c2` |
| `inspection-music.mp3` | `9199a85864ff1fb70a6b756808f267983a2cf05155014fb84a9fd3dc948619e9` |
| `shot-compact.mp3` | `cd8da090adccdaf148978b9aee755cb278ef396feadb9f5e63b584567ebac02c` |
| `shot-carbine.mp3` | `b53f9ab2ef6f5a77518d646dc4ac6a7f71a654850f6d389a1c49a426274249bb` |
| `shot-longshot.mp3` | `7ed9993f6580f8bf6fbd0c778a37d0daa545c30d5aa30dc189febcabb0d3937c` |
| `hit.mp3` | `a962c59df824106f40f0e99afc7a5abc7e60416ea65a1bceebdc0c5cbfd65593` |
| `bullseye.mp3` | `c76e2f15986596fbc77ef4ece1cc39e328e496ffc66c6d87be140aa38aabd367` |
| `round-start.mp3` | `70e90aae37c74579af04350efa29cb6a1ae284c22c1dd92216f4ad2eff15fc73` |
| `round-complete.mp3` | `d29c750ff23e57f6abb51f446515cc7b09c3858db1693c962f91146ae350fd58` |
