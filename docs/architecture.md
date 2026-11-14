# Module map

Read the modules a change touches; skip the rest. Tests sit next to their module as `<module>.test.ts`. Domain terms are defined in `CONTEXT.md`.

## `src/core/`: deterministic simulation

Pure, seeded, no DOM, canvas, or clock (ADR-0001).

| Module | Responsibility |
| --- | --- |
| `match.ts` | Match state machine: `createMatch`, `step`, `adjustAim`, `fire` (returns the launched shot record), `fireReceivedShot`, `nextShooter`, `previewShot`, read-only `matchView` |
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
| `main.ts` | Boot: queries elements, loads assets, builds the route adapters (injecting the browser peer connections and the Nostr reply relay into the host and guest screens), binds input and screens, starts the loop |
| `routeController.ts` | Route entry in one place: draws the seed and takes the match rules, applies the route to the screen session, then the host and guest screens, then the shown screen; starts the remote match on handover; turns a step's `"mainMenu"` result into the main menu route; screen display, hash navigation and the host and guest screens are injected adapters |
| `gameLoop.ts` | Fixed 30 Hz step loop plus render callback |
| `screenSession.ts` | Current screen as a per-screen union of hot-seat match, remote match or attract mode; routes aim and fire, steps it (a step reports `"mainMenu"` once a remote match's end notice has run out), describes its frame and shake; entering any route or another remote match leaves a running remote match first |
| `remoteMatch.ts` | Lockstep remote match from a role and an open `PeerLink` to the return to the main menu: the host draws the seed, takes the match rules from its settings, sends hello and plays left, guest builds the match from it and plays right; local input only on the local turn, round starts only by the next shooter and sent to the opponent, throttled aim streaming, opponent moves (aim, shot, round start) applied in order once the local flight has ended, outcome comparison, endings (left, opponent left, out of sync, version mismatch), the notice shown after an ending and the step result asking for the main menu once it has run out |
| `navigation.ts` | Hash routes (including the play menu, the host route and invitation routes carrying an offer code and a room secret), screens (the remote match has no route of its own: while it runs, the URL still shows the host route or the guest's invitation route, so reloading starts a new host or guest visit rather than resuming the match), which screens play attract mode (ADR-0002), menu focus movement (ADR-0003) |
| `screens.ts` | HTML menu/settings/credits overlays, button effects, settings tabs, one table-driven binder for every settings control (located by `data-setting` in the markup), route binding (ADR-0002) |
| `remoteVisit.ts` | Host and guest visit flow up to an open connection, without the DOM: pending, then for the host the invitation (offer code and the room secret of the relay room it listens on) and connecting, for the guest joining (reply delivered through the relay) and the reply code fallback (shown when no relay accepted the reply, or no connection opened within `REPLY_FALLBACK_MS`), then handed over or failed, reported as `VisitState`s; the first reply, from the relay or pasted, is taken while it connects, and the room closes on handover, a final failure or leaving; retry only after a rejected reply code (malformed, wrong kind, protocol mismatch); hands the open link over once, with its role, through the callback the route controller passes; a connection arriving after the visit was left is closed instead; unexpected (non-`PeerConnectionError`) failures are rethrown; the host and guest peer-connection functions are injected as `PeerConnectors` |
| `remoteMatchScreens.ts` | DOM side of the host and guest screens: starts a visit per host or guest route and leaves the previous one, renders each `VisitState` (invitation link and reply code with copy buttons, reply code entry as the host's secondary option, status and failure messages per role) and passes reply code submissions to the host visit |
| `settings.ts` | Setting rule table (control kind, choices, labels, default, display vs match rule per setting) and the Settings type, defaults, parse/serialise of the stored form and match rules derived from it, stored-form match rules for the wire; planet count drag-along |
| `remoteProtocol.ts` | Remote match wire messages (hello, aim, shot, nextRound, outcome, leave): JSON encode, never-throwing decode with validation, `PROTOCOL_VERSION`, shot outcome comparison |
| `signalingCode.ts` | Compact, URL-safe signaling codes: a non-trickle offer or answer reduced to its connection fields (ICE credentials, DTLS fingerprint, setup role, candidates), deflated and base64url-encoded with the protocol version; never-throwing decode back to an SDP from a fixed data-channel template, rejecting garbage, wrong kind and version mismatch |
| `peerConnection.ts` | Browser `RTCPeerConnection` with one ordered, reliable data channel for host and guest: non-trickle offer and reply codes over public STUN only, a connect timeout after the host accepts a reply (the guest waits until its connection opens or fails) and a no-candidates failure as `PeerConnectionError`, and an open link to send and receive text plus a closed signal that fires once; connection factory injectable for tests; `HostPeerConnection` and `JoinPeerConnection` types for injecting the host and guest functions |
| `replyRelay.ts` | Carries the guest's reply code to the host through a fixed list of public Nostr relays (ADR-0004): the host opens a fresh room and subscribes to its tag on every relay, taking each reply once however many relays forward it; the guest seals and publishes its reply to every relay, `accepted` on the first relay acknowledgement or `unreached` when every relay rejected it, went away, or stayed silent for `RELAY_ACK_TIMEOUT_MS`; relay sockets are injectable for tests |
| `relayRoom.ts` | Room secret and the relay room derived from it with WebCrypto: the room tag relays filter on and AES-GCM sealing and opening, so relays see only opaque data; opening never throws |
| `nostrEvent.ts` | Nostr wire format for relay rooms: ephemeral room events signed by a throwaway Schnorr key (`@noble/curves`), publish and subscribe messages, never-throwing parse of relay acknowledgements and events |
| `settingsStorage.ts` | Reads and writes the stored settings in `localStorage`, tolerating unavailable storage |
| `input.ts` | Keyboard bindings for aiming, firing, escape |
| `aimKeyRepeat.ts` | Held-key repeat timing for aim adjustment |
| `frameItems.ts` | Frame item vocabulary shared by frame description and the renderer: `FrameItem` (sprites, rings, lines, text, rects, groups), `Rect`, `Transform`, `SpriteName` |
| `frame.ts` | Turns a `MatchView` into `FrameItem` data for a `Viewer` (attract mode, hot seat, or a remote match's local side, giving You/Opponent labels and a turn line), plus remote notices; no drawing, no dependency on the remote match |
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
| `remoteMatch.test.ts` | End-to-end check: two screen sessions over an in-memory channel play a remote match in lockstep and drive each ending through to the main menu step result |
