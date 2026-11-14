# Module map

Read the modules a change touches; skip the rest. Tests sit next to their module as `<module>.test.ts`. Domain terms are defined in `CONTEXT.md`.

## `src/core/`: deterministic simulation

Pure, seeded, no DOM, canvas, or clock (ADR-0001).

| Module | Responsibility |
| --- | --- |
| `match.ts` | Match state machine: `createMatch`, `step`, `adjustAim`, `fire`, `previewShot`, read-only `matchView` |
| `round.ts` | Round layout generation (ships, planets), `Ship`/`Planet`/`Aim` types, `BARREL_DISTANCE` |
| `flight.ts` | Body and missile physics: `moveBody` (gravity, planet contact, edge reflection under bounce, tracking) shared by missiles and debris; launch, ship collision (`flyMissile`), timeout, `STEPS_PER_SECOND` |
| `scoring.ts` | Round results, power penalty, next-round shooter |
| `zoom.ts` | View zoom per step: `nextZoom(previous, missile)` fits an out-of-area missile, leans toward its side, eases back |
| `attract.ts` | Self-playing demo match behind the main menu |
| `playingArea.ts` | Playing and tracking area bounds |
| `random.ts` | Seeded PRNG |

## `src/`: presentation and wiring

| Module | Responsibility |
| --- | --- |
| `main.ts` | Boot: loads assets, binds input and screens, starts the loop |
| `gameLoop.ts` | Fixed 30 Hz step loop plus render callback |
| `screenSession.ts` | Current screen as a per-screen union of match or attract mode; routes aim and fire, steps it, describes its frame and shake |
| `navigation.ts` | Hash routes (including the host route and invitation routes carrying an offer code), screens, which screens play attract mode (ADR-0002), menu focus movement (ADR-0003) |
| `screens.ts` | HTML menu/settings/credits overlays, button effects, settings tabs, one table-driven binder for every settings control (located by `data-setting` in the markup), route binding (ADR-0002) |
| `settings.ts` | Setting rule table (control kind, choices, labels, default, display vs match rule per setting) and the Settings type, defaults, parse/serialise of the stored form and match rules derived from it, stored-form match rules for the wire; planet count drag-along |
| `remoteProtocol.ts` | Remote match wire messages (hello, aim, shot, outcome, leave): JSON encode, never-throwing decode with validation, `PROTOCOL_VERSION`, shot outcome comparison |
| `signalingCode.ts` | Compact, URL-safe signaling codes: a non-trickle offer or answer reduced to its connection fields (ICE credentials, DTLS fingerprint, setup role, candidates), deflated and base64url-encoded with the protocol version; never-throwing decode back to an SDP from a fixed data-channel template, rejecting garbage, wrong kind and version mismatch |
| `peerConnection.ts` | Browser `RTCPeerConnection` with one ordered, reliable data channel for host and guest: non-trickle offer and reply codes over public STUN only, a connect timeout and a no-candidates failure as `PeerConnectionError`, and an open link to send and receive text plus a closed signal that fires once; connection factory injectable for tests |
| `settingsStorage.ts` | Reads and writes the stored settings in `localStorage`, tolerating unavailable storage |
| `input.ts` | Keyboard bindings for aiming, firing, escape |
| `aimKeyRepeat.ts` | Held-key repeat timing for aim adjustment |
| `frame.ts` | Turns a `MatchView` into `FrameItem` data (sprites, rings, lines, text); no drawing |
| `renderer.ts` | Draws `FrameItem`s onto the canvas |
| `animationCurves.ts` | Afterglow, trail fade, explosion, round banner curves |
| `screenShake.ts` | Shake offset after hits |
| `debris.ts` | Cosmetic impact particles: advancing from a match view, bursts, motion via core `moveBody`, splitting on planets, fade-out; state and unseeded randomness stay outside the core |
| `stars.ts` / `starLayer.ts` | Star field generation / drawing |
| `display.ts` | Fits canvas and overlay to the window |
| `assets.ts` | Sprite and font loading |
| `colours.ts` | Colour tokens |
| `scramble.ts` | Menu label scramble effect |
| `shipHits.test.ts` | End-to-end check: seeded matches through the screen session register ship hits |
