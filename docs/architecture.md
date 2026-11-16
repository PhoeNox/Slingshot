# Module map

Read the modules a change touches; skip the rest. Each row is the module's gist; its code and `CONTEXT.md` hold the detail. Tests sit next to their module as `<module>.test.ts`.

## `src/core/`: deterministic simulation

Pure, seeded, no DOM, canvas, or clock (ADR-0001).

| Module | Responsibility |
| --- | --- |
| `match.ts` | Match state machine (`createMatch`, `step`, `adjustAim`, `fire`, `startNextRound`) and the read-only `matchView` and queries other modules ask |
| `round.ts` | Round layout generation (ships, planets) and the `Ship`/`Planet`/`Aim` types |
| `flight.ts` | Body and missile physics: gravity, planet contact, edge reflection, ship collision, timeout |
| `scoring.ts` | Round results, power penalty, next-round shooter |
| `zoom.ts` | View zoom per step that fits an out-of-area missile and eases back |
| `attract.ts` | Self-playing demo match behind the main menu |
| `playingArea.ts` | Playing and tracking area bounds |
| `random.ts` | Seeded PRNG |

## Static shell: markup and layout

| File | Responsibility |
| --- | --- |
| `index.html` | All DOM: the `#stage` with canvas and `#overlay` panels (`data-screen` per overlay screen, `data-setting` per settings control), the hint bar `.key-hint` (gesture hint, Menu, Fullscreen) and the rotate prompt |
| `src/style.css` | All layout and styling, including the media-query branches per device (`pointer: coarse`, `orientation: landscape`/`portrait`) that place the hint bar and show the rotate prompt |

## `src/`: presentation and wiring

| Module | Responsibility |
| --- | --- |
| `main.ts` | Boot: queries elements, loads assets, builds the settings store and the screen session with their adapters, binds input, navigation and screens, starts the loop |
| `gameLoop.ts` | Fixed 30 Hz step loop plus render callback |
| `screenSession.ts` | Owns the current screen, the one current `PlayedMatch` and the host or guest visit; enters routes, steps the played match, plays its sound effects and describes each frame as layers |
| `playedMatch.ts` | The `PlayedMatch` interface the screen session drives, with the hot-seat and attract-mode adapters (ADR-0002) |
| `remoteMatch.ts` | Remote match over an open `PeerLink`, presented as a `PlayedMatch`, driving the lockstep through the effect loop |
| `lockstep.ts` | Lockstep rules of a remote match as a pure transition (event in, effects out), with no link, encoder or decoder |
| `navigation.ts` | Hash routes, screens, which screens play attract mode (ADR-0002), menu focus movement (ADR-0003) |
| `screens.ts` | HTML overlays shown from one table keyed by every screen, button effects, the menu select sound, settings tabs, the table-driven settings control binder |
| `hashNavigation.ts` | The one module that reads and writes the URL hash, over a `HashLocation` port (window and in-memory adapters) |
| `remoteVisit.ts` | Host and guest visit up to an open connection, performing the visit transition's effects through the effect loop |
| `effectLoop.ts` | The one driver loop of the lockstep and the visit: performs effects in order and feeds every arrival back as an event |
| `visitTransition.ts` | Visit rules of the host and the guest as a pure transition, with no connector, relay, timer or promise |
| `remoteMatchScreens.ts` | DOM side of the host and guest screens: renders each `VisitState` and forwards reply code submissions |
| `settings.ts` | Setting rule table, the `Settings` type, defaults, parse/serialise, derived match rules and display settings |
| `remoteProtocol.ts` | Remote match wire messages: JSON encode, never-throwing decode, `PROTOCOL_VERSION`, shot outcome comparison |
| `signalingCode.ts` | Compact, URL-safe signaling codes for a non-trickle offer or answer, with never-throwing decode |
| `peerConnection.ts` | Browser `RTCPeerConnection` with one reliable data channel for host and guest, and its `PeerConnectionError` failures |
| `replyRelay.ts` | Carries the guest's reply code to the host through public Nostr relays (ADR-0004) |
| `relayRoom.ts` | Room secret, room tag and AES-GCM sealing with WebCrypto |
| `nostrEvent.ts` | Nostr wire format for relay rooms: signed ephemeral events, publish and subscribe messages, never-throwing parse |
| `settingsStore.ts` | The settings in one place: load, change and save, plus snapshots of match rules and display settings (ADR-0002) |
| `settingsStorage.ts` | `SettingsStorage` adapters: `localStorage` and in-memory |
| `input.ts` | Thin DOM adapter that passes key, pointer and blur events to the player input |
| `playerInput.ts` | Player input without the DOM: turns key, pointer and timer events into aim and fire on the current played match |
| `aimKeyRepeat.ts` | Held-key repeat rules for aim adjustment |
| `touchAim.ts` | Touch gesture rules without the DOM: tap fires, a drag locks to an axis and emits aim steps |
| `frameItems.ts` | Frame item vocabulary shared by frame description and the renderer (`FrameItem`, `FrameLayer`) |
| `frame.ts` | Turns a `MatchView` into `FrameItem` data for a `Viewer`, including the HUD scale on small canvases |
| `renderer.ts` | Draws `FrameItem`s and `FrameLayer`s onto the canvas |
| `animationCurves.ts` | Afterglow, trail fade, explosion, round banner curves |
| `screenShake.ts` | Shake offset after hits |
| `debris.ts` | Cosmetic impact particles, unseeded, kept outside the core |
| `stars.ts` / `starLayer.ts` | Star field generation (unseeded, at boot) / drawing |
| `wakeLock.ts` | Screen wake lock adapter that keeps the screen awake while asked to |
| `display.ts` | Fits canvas and overlay to the stage's size, with the fit's CSS scale |
| `fullscreen.ts` | Fullscreen availability, entering it with the orientation locked to landscape, and toggling it |
| `assets.ts` | Sprite, font and sound loading |
| `audio.ts` | Web Audio adapter: the audio context held back until the first user activation and suspended while the page is hidden, the gapless music loop and the overlapping sound effects |
| `colours.ts` | Colour tokens |
| `scramble.ts` | Menu label scramble effect |

## Cross-module tests

| Test | Checks |
| --- | --- |
| `shipHits.test.ts` | Seeded matches through the screen session register ship hits |
| `remoteMatch.test.ts` | Two screen sessions over an in-memory channel play a remote match to each ending |
