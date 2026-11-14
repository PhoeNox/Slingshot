# Remote matches over WebRTC with copy-paste signaling

The game stays a static site with no server of its own, so remote matches run over a WebRTC data channel whose signaling is exchanged by hand: the host sends an invitation link carrying a compacted, non-trickle offer in its hash, and the guest sends back a reply code for the host to paste. Only public STUN servers are used, with no TURN, so pairs behind symmetric NAT or CGNAT cannot connect and are told so. The peers run in lockstep on ADR-0001's deterministic core: the host sends a protocol version, its match rules and a fresh seed, after which only shot records (plus cosmetic live aim) cross the wire, and both sides compare each shot's outcome to surface divergence as "out of sync". Peers trust each other beyond rejecting structurally invalid shot records.

## Considered Options

- **Asynchronous play-by-link** (the full shot log in a URL, sent after every shot): needs nothing at all and always connects, but is correspondence-paced rather than live.
- **Public third-party signaling brokers** (Nostr relays, BitTorrent trackers, MQTT, PeerJS cloud): one-click joining, but ties the game to someone else's free infrastructure.
- **Hosting a TURN or signaling server**: excluded by the no-server constraint.

## Consequences

- The invitation needs its own hash route, which ADR-0003's rule of replacing unknown hashes with `#/` must allow for.
- A dropped connection ends the match; resuming would need a new code exchange and a replay of the shot log.
- Each peer sees the other's IP address, which the host screen discloses.
