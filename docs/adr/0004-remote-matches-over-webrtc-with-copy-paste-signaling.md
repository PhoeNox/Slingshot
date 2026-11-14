# Remote matches over WebRTC with copy-paste signaling

The game stays a static site with no server of its own, so remote matches run over a WebRTC data channel whose signaling is exchanged by hand: the host sends an invitation link carrying a compacted, non-trickle offer in its hash, and the guest sends back a reply code for the host to paste. Only public STUN servers are used, with no TURN, so pairs behind symmetric NAT or CGNAT cannot connect and are told so. The peers run in lockstep on ADR-0001's deterministic core: the host sends a protocol version, its match rules and a fresh seed, after which only shot records, round starts (plus cosmetic live aim) cross the wire, and both sides compare each shot's outcome to surface divergence as "out of sync". Peers trust each other beyond rejecting structurally invalid shot records.

## Considered Options

- **Asynchronous play-by-link** (the full shot log in a URL, sent after every shot): needs nothing at all and always connects, but is correspondence-paced rather than live.
- **Public third-party signaling brokers** (Nostr relays, BitTorrent trackers, MQTT, PeerJS cloud): one-click joining, but ties the game to someone else's free infrastructure.
- **Hosting a TURN or signaling server**: excluded by the no-server constraint.

## Consequences

- The invitation needs its own hash route, which ADR-0003's rule of replacing unknown hashes with `#/` must allow for.
- A dropped connection ends the match; resuming would need a new code exchange and a replay of the shot log.
- Each peer sees the other's IP address, which the host screen discloses.

## Amendment: round starts are sent

Moving from round over to the next round is an explicit lockstep event. Only the next round's first shooter may start it: their key press starts the round locally and sends a `nextRound` message, and the waiting peer's key press does nothing while its round-over panel says it is waiting. The receiver applies `nextRound`, aim and shots in the order sent, each once its own flight has ended, so the opponent's aim shows as soon as their round has started rather than being dropped until their shot arrives. A shot can therefore only arrive while its round is already running, so the core no longer looks ahead in the seeded random generator to check a shot received during round over; it rejects such a shot. The change bumped `PROTOCOL_VERSION` to 2.

Rejected: keeping round starts implicit, with the waiting peer starting the round on the shooter's first aim or shot. A shooter who fires without moving their aim would leave the waiting peer on the round-over panel until a missile appeared mid-flight, and the core would keep its rng lookahead.
