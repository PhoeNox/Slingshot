# Module map

Read the modules a change touches; skip the rest. Tests sit next to their module as `<module>.test.ts`. Domain terms are defined in `CONTEXT.md`.

## `src/core/`: deterministic simulation

Pure, seeded, no DOM, canvas, or clock (ADR-0001).

| Module | Responsibility |
| --- | --- |
| `match.ts` | Match state machine: `createMatch`, `step`, `adjustAim`, `fire`, `previewShot`, read-only `matchView` |
| `round.ts` | Round layout generation (ships, planets), `Ship`/`Planet`/`Aim` types, `BARREL_DISTANCE` |
| `flight.ts` | Missile physics: launch, gravity step, planet/ship collision (`flyMissile`), timeout |
| `scoring.ts` | Round results, power penalty, next-round shooter |
| `attract.ts` | Self-playing demo match behind the main menu |
| `playingArea.ts` | Playing and tracking area bounds |
| `random.ts` | Seeded PRNG |

## `src/`: presentation and wiring

| Module | Responsibility |
| --- | --- |
| `main.ts` | Boot: loads assets, binds input and screens, starts the loop |
| `gameLoop.ts` | Fixed 30 Hz step loop plus render callback |
| `screenSession.ts` | Current screen and its match or attract mode; steps it and describes its frame |
| `navigation.ts` | Hash routes, screens, menu focus movement (ADR-0003) |
| `screens.ts` | HTML menu/settings/credits overlays, button effects, settings tabs, one table-driven binder for every settings control (located by `data-setting` in the markup), route binding (ADR-0002) |
| `settings.ts` | Setting rule table (control kind, choices, labels, default, display vs match rule per setting) and the Settings type, defaults, parse/serialise of the stored form and match rules derived from it; planet count drag-along |
| `settingsStorage.ts` | Reads and writes the stored settings in `localStorage`, tolerating unavailable storage |
| `input.ts` | Keyboard bindings for aiming, firing, escape |
| `aimKeyRepeat.ts` | Held-key repeat timing for aim adjustment |
| `frame.ts` | Turns a `MatchView` into `FrameItem` data (sprites, rings, lines, text); no drawing |
| `renderer.ts` | Draws `FrameItem`s onto the canvas |
| `animationCurves.ts` | Afterglow, trail fade, explosion, round banner curves |
| `screenShake.ts` | Shake offset after hits |
| `debris.ts` | Cosmetic impact particles: bursts, gravity, splitting on planets, fade-out |
| `stars.ts` / `starLayer.ts` | Star field generation / drawing |
| `display.ts` | Fits canvas and overlay to the window |
| `assets.ts` | Sprite and font loading |
| `colours.ts` | Colour tokens |
| `scramble.ts` | Menu label scramble effect |
| `shipHits.test.ts` | End-to-end check: seeded matches through the screen session register ship hits |
