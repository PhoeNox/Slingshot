// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { adjustAim, DEFAULT_MATCH_RULES, fire, matchView, nextShooter, step, type Aim, type Match, type Side } from "./core/match";
import type { PeerLink } from "./peerConnection";
import { encodeMessage, type RemoteMessage } from "./remoteProtocol";
import { remoteNotice, type RemoteMatch } from "./remoteMatch";
import {
  aimMatch,
  createScreenSession,
  enterHostedRemoteMatch,
  enterJoinedRemoteMatch,
  enterScreen,
  fireMatch,
  isRemoteMatchFinished,
  stepScreenSession,
  type ScreenSession,
} from "./screenSession";

interface Endpoint {
  link: PeerLink;
  inbox: string[];
  listener: ((text: string) => void) | undefined;
}

interface FakeChannel {
  host: Endpoint;
  guest: Endpoint;
  closed: boolean;
  tamperToGuest: (text: string) => string;
}

interface Peers {
  channel: FakeChannel;
  host: ScreenSession;
  guest: ScreenSession;
}

const SEED = 7;
const ROUNDS = 3;
const MAX_SHOTS = 40;
const MAX_STEPS = 5000;
const END_NOTICE_STEPS = 90;
const ANGLES = Array.from({ length: 180 }, (_, i) => i * 2);
const POWERS = [100, 150, 200, 250, 300];

function fakeChannel(): FakeChannel {
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  const channel = { closed: false, tamperToGuest: (text: string) => text } as FakeChannel;
  const close = () => {
    channel.closed = true;
    markClosed();
  };
  const endpoint = (deliverTo: () => Endpoint, tamper: (text: string) => string): Endpoint => {
    const end: Endpoint = {
      inbox: [],
      listener: undefined,
      link: {
        send: (text) => {
          if (!channel.closed) {
            deliverTo().inbox.push(tamper(text));
          }
        },
        onMessage: (listener) => {
          end.listener = listener;
        },
        closed,
        close,
      },
    };
    return end;
  };
  channel.host = endpoint(() => channel.guest, (text) => channel.tamperToGuest(text));
  channel.guest = endpoint(() => channel.host, (text) => text);
  return channel;
}

function deliver(channel: FakeChannel): void {
  const listening = [channel.host, channel.guest].filter((end) => end.listener !== undefined);
  while (listening.some((end) => end.inbox.length > 0)) {
    for (const end of listening) {
      for (const text of end.inbox.splice(0)) {
        end.listener!(text);
      }
    }
  }
}

function connectedPeers(): Peers {
  const channel = fakeChannel();
  const host = createScreenSession(1, () => 0.5);
  const guest = createScreenSession(2, () => 0.5);
  enterHostedRemoteMatch(host, channel.host.link, SEED, DEFAULT_MATCH_RULES);
  enterJoinedRemoteMatch(guest, channel.guest.link);
  deliver(channel);
  return { channel, host, guest };
}

function remoteOf(session: ScreenSession): RemoteMatch {
  if (session.state.screen !== "remoteMatch") {
    throw new Error("expected a remote match");
  }
  return session.state.remote;
}

function matchOf(session: ScreenSession): Match {
  const match = remoteOf(session).match;
  if (match === undefined) {
    throw new Error("expected a started remote match");
  }
  return match;
}

function sessionOf(peers: Peers, side: Side): ScreenSession {
  return side === "left" ? peers.host : peers.guest;
}

function otherSession(peers: Peers, session: ScreenSession): ScreenSession {
  return session === peers.host ? peers.guest : peers.host;
}

function settle(peers: Peers, session: ScreenSession): void {
  for (let i = 0; i < MAX_STEPS && matchOf(session).phase.kind === "inFlight"; i++) {
    stepScreenSession(session, false);
    deliver(peers.channel);
  }
}

function stepBoth(peers: Peers, steps: number): void {
  for (let i = 0; i < steps; i++) {
    stepScreenSession(peers.host, false);
    stepScreenSession(peers.guest, false);
    deliver(peers.channel);
  }
}

function aimDeltaTo(match: Readonly<Match>, target: Aim): Aim {
  const aim = match.ships[match.activePlayer].aim;
  return { angle: target.angle - aim.angle, power: target.power - aim.power };
}

function findAim(match: Readonly<Match>, wantHit: boolean): Aim {
  for (const angle of ANGLES) {
    for (const power of POWERS) {
      const trial = structuredClone(match) as Match;
      const target = { angle, power };
      adjustAim(trial, aimDeltaTo(trial, target));
      const shooter = trial.activePlayer;
      fire(trial);
      for (let i = 0; i < MAX_STEPS && trial.phase.kind === "inFlight"; i++) {
        step(trial);
      }
      const hitOpponent = trial.phase.kind === "roundOver" && trial.phase.result.hitShip !== shooter;
      const missed = trial.phase.kind === "aiming";
      if (wantHit ? hitOpponent : missed) {
        return target;
      }
    }
  }
  throw new Error(`no aim found for ${wantHit ? "a hit" : "a miss"}`);
}

function takeShot(peers: Peers, shooter: ScreenSession, wantHit: boolean): void {
  settle(peers, shooter);
  const match = matchOf(shooter);
  if (match.phase.kind === "roundOver") {
    fireMatch(shooter);
  }
  const target = findAim(match, wantHit);
  aimMatch(shooter, aimDeltaTo(match, target));
  fireMatch(shooter);
  deliver(peers.channel);
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

function sendRaw(channel: FakeChannel, to: Endpoint, message: unknown): void {
  to.inbox.push(JSON.stringify(message));
  deliver(channel);
}

describe("starting a remote match", () => {
  test("the guest creates the host's match from the hello, host left and guest right", () => {
    const { host, guest } = connectedPeers();

    expect(remoteOf(host).localSide).toBe("left");
    expect(remoteOf(guest).localSide).toBe("right");
    expect(matchView(matchOf(guest))).toEqual(matchView(matchOf(host)));
  });

  test("the guest waits for the host until the hello arrives", () => {
    const channel = fakeChannel();
    const guest = createScreenSession(2, () => 0.5);
    enterJoinedRemoteMatch(guest, channel.guest.link);

    expect(remoteNotice(remoteOf(guest))).toBe("awaitingHost");
  });

  test("a hello from a different protocol version ends the match as a version mismatch", () => {
    const channel = fakeChannel();
    const guest = createScreenSession(2, () => 0.5);
    enterJoinedRemoteMatch(guest, channel.guest.link);
    const hello = { kind: "hello", protocolVersion: 999, rules: {}, seed: 1 };

    sendRaw(channel, channel.guest, hello);

    expect(remoteNotice(remoteOf(guest))).toBe("versionMismatch");
  });
});

describe("playing a remote match", () => {
  test("both peers play several rounds to identical scores", () => {
    const peers = connectedPeers();
    let lagging = sessionOf(peers, matchOf(peers.host).activePlayer);
    for (let shot = 0; shot < MAX_SHOTS && matchOf(peers.host).roundNumber <= ROUNDS; shot++) {
      const settled = otherSession(peers, lagging);
      const shooter = sessionOf(peers, nextShooter(matchOf(settled)));
      takeShot(peers, shooter, shot % 2 === 1);
      lagging = shooter;
      settle(peers, otherSession(peers, shooter));
    }
    settle(peers, peers.host);
    settle(peers, peers.guest);
    deliver(peers.channel);

    const hostView = matchView(matchOf(peers.host));
    const guestView = matchView(matchOf(peers.guest));
    expect(hostView.roundNumber).toBeGreaterThan(ROUNDS);
    expect(guestView.scores).toEqual(hostView.scores);
    expect(guestView.roundNumber).toBe(hostView.roundNumber);
    expect(guestView.trails).toEqual(hostView.trails);
    expect(remoteOf(peers.host).end).toBeUndefined();
    expect(remoteOf(peers.guest).end).toBeUndefined();
  });

  test("a shot arriving while the receiver is in round-over starts the next round there", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    takeShot(peers, shooter, true);
    settle(peers, shooter);
    settle(peers, receiver);
    const nextShooterSession = sessionOf(peers, nextShooter(matchOf(receiver)));
    const waitingSession = otherSession(peers, nextShooterSession);

    takeShot(peers, nextShooterSession, false);

    expect(matchOf(waitingSession).roundNumber).toBe(2);
    expect(matchOf(waitingSession).phase.kind).toBe("inFlight");
  });

  test("a shot arriving while the receiver is still in flight is applied once that flight ends", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    takeShot(peers, shooter, false);
    settle(peers, receiver);

    takeShot(peers, receiver, false);
    const queuedWhileInFlight = matchOf(shooter).phase.kind === "inFlight" && remoteOf(shooter).receivedShots.length === 1;
    settle(peers, shooter);
    stepBoth(peers, 1);
    settle(peers, shooter);
    settle(peers, receiver);

    expect(queuedWhileInFlight).toBe(true);
    expect(matchOf(shooter).trails).toEqual(matchOf(receiver).trails);
    expect(matchOf(shooter).attempts).toEqual({ left: 1, right: 1 });
    expect(remoteOf(shooter).end).toBeUndefined();
  });

  test("aim and fire on the opponent's turn have no effect on either side", () => {
    const peers = connectedPeers();
    const waiting = otherSession(peers, sessionOf(peers, matchOf(peers.host).activePlayer));
    const hostBefore = structuredClone(matchView(matchOf(peers.host)));
    const guestBefore = structuredClone(matchView(matchOf(peers.guest)));

    aimMatch(waiting, { angle: 30, power: 50 });
    fireMatch(waiting);
    deliver(peers.channel);

    expect(matchView(matchOf(peers.host))).toEqual(hostBefore);
    expect(matchView(matchOf(peers.guest))).toEqual(guestBefore);
  });

  test("streamed aim moves the opponent's ship on the receiving side", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    const side = matchOf(shooter).activePlayer;

    aimMatch(shooter, { angle: 10, power: 20 });
    stepBoth(peers, 3);

    expect(matchOf(receiver).ships[side].aim).toEqual(matchOf(shooter).ships[side].aim);
  });
});

describe("out of sync", () => {
  test("a tampered outcome ends the match as out of sync on the receiving side", async () => {
    const peers = connectedPeers();
    peers.channel.tamperToGuest = (text) => {
      const message = JSON.parse(text);
      if (message.kind === "outcome") {
        message.outcome.stepsFlown += 1;
      }
      return JSON.stringify(message);
    };
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);

    takeShot(peers, shooter, false);
    settle(peers, peers.host);
    settle(peers, peers.guest);
    await flushPromises();

    expect(remoteNotice(remoteOf(peers.guest))).toBe("outOfSync");
    expect(remoteNotice(remoteOf(peers.host))).toBe("opponentLeft");
  });

  test("an invalid shot ends the match as out of sync on the receiving side", async () => {
    const peers = connectedPeers();
    const shot: RemoteMessage = { kind: "shot", aim: { angle: 0, power: 999 }, shot: { x: 0, y: 0, vx: 0, vy: 0 } };

    peers.channel.guest.inbox.push(encodeMessage(shot));
    deliver(peers.channel);
    await flushPromises();

    expect(remoteNotice(remoteOf(peers.guest))).toBe("outOfSync");
    expect(remoteNotice(remoteOf(peers.host))).toBe("opponentLeft");
  });
});

describe("ending a remote match", () => {
  test("a received leave shows opponent left and closes the connection", () => {
    const peers = connectedPeers();

    sendRaw(peers.channel, peers.channel.guest, { kind: "leave" });

    expect(remoteNotice(remoteOf(peers.guest))).toBe("opponentLeft");
    expect(peers.channel.closed).toBe(true);
  });

  test("a closed channel shows opponent left on both sides", async () => {
    const peers = connectedPeers();

    peers.channel.host.link.close();
    await flushPromises();

    expect(remoteNotice(remoteOf(peers.host))).toBe("opponentLeft");
    expect(remoteNotice(remoteOf(peers.guest))).toBe("opponentLeft");
  });

  test("escape leaves for the main menu and shows opponent left on the other side", async () => {
    const peers = connectedPeers();

    enterScreen(peers.host, "mainMenu", 3, DEFAULT_MATCH_RULES);
    deliver(peers.channel);
    await flushPromises();

    expect(peers.host.state.screen).toBe("mainMenu");
    expect(remoteNotice(remoteOf(peers.guest))).toBe("opponentLeft");
    expect(peers.channel.closed).toBe(true);
  });

  test("the opponent-left notice returns to the main menu after a while", () => {
    const peers = connectedPeers();
    sendRaw(peers.channel, peers.channel.guest, { kind: "leave" });

    stepBoth(peers, END_NOTICE_STEPS - 1);
    const finishedEarly = isRemoteMatchFinished(peers.guest);
    stepBoth(peers, 1);

    expect(finishedEarly).toBe(false);
    expect(isRemoteMatchFinished(peers.guest)).toBe(true);
  });
});
