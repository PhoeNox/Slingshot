// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { adjustAim, DEFAULT_MATCH_RULES, fire, matchView, nextShooter, step, type Aim, type Match, type MatchRules, type Side } from "./core/match";
import { remoteNotice, type RemoteMatchEnd } from "./lockstep";
import type { FixedRouteScreen } from "./navigation";
import type { PeerLink } from "./peerConnection";
import { encodeMessage, type RemoteMessage } from "./remoteProtocol";
import type { RemoteMatch, RemoteRole } from "./remoteMatch";
import { createScreenSession, type ScreenSession, type ScreenSessionAdapters } from "./screenSession";
import { DEFAULT_SETTINGS, matchRulesFor, type Settings } from "./settings";

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

type ShotResult = "hit" | "miss";

interface RoundOverSessions {
  next: ScreenSession;
  waiting: ScreenSession;
}

interface EndingCase {
  end: Exclude<RemoteMatchEnd, "left">;
  endMatch: () => ScreenSession;
}

const SEED = 7;
const ROUNDS = 3;
const MAX_SHOTS = 40;
const MAX_STEPS = 5000;
const END_NOTICE_STEPS = 90;
const ANGLES = Array.from({ length: 180 }, (_, i) => i * 2);
const POWERS = [100, 150, 200, 250, 300];
const DEFAULT_AIMS: Record<Side, Aim> = { left: { angle: 90, power: 100 }, right: { angle: 270, power: 100 } };

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

const remotes = new WeakMap<ScreenSession, RemoteMatch>();
const navigations = new WeakMap<ScreenSession, FixedRouteScreen[]>();

function noVisit(): never {
  throw new Error("expected no host or guest visit");
}

function remoteSession(): ScreenSession {
  const navigated: FixedRouteScreen[] = [];
  const adapters: ScreenSessionAdapters = {
    random: () => 0.5,
    settings: { matchRules: () => DEFAULT_MATCH_RULES },
    showScreen: () => {},
    navigateTo: (screen) => {
      navigated.push(screen);
    },
    peers: { host: noVisit, join: noVisit },
    relay: { awaitReplies: noVisit, deliverReply: noVisit },
    visitScreens: { showHostState: noVisit, showGuestState: noVisit },
    playSoundEffect: () => {},
  };
  const session = createScreenSession(adapters);
  navigations.set(session, navigated);
  return session;
}

function navigationsOf(session: ScreenSession): FixedRouteScreen[] {
  const navigated = navigations.get(session);
  if (navigated === undefined) {
    throw new Error("expected a remote session");
  }
  return navigated;
}

function playRemote(session: ScreenSession, role: RemoteRole, link: PeerLink, rules: Readonly<MatchRules>): void {
  const remote = session.enterRemoteMatch(role, link, SEED, rules);
  remotes.set(session, remote);
}

function leaveForMainMenu(session: ScreenSession): void {
  session.enterRoute({ screen: "mainMenu", replace: false });
}

function joinedGuest(channel: FakeChannel): ScreenSession {
  const guest = remoteSession();
  playRemote(guest, "guest", channel.guest.link, DEFAULT_MATCH_RULES);
  return guest;
}

function connectedPeers(hostSettings: Readonly<Settings> = DEFAULT_SETTINGS): Peers {
  const channel = fakeChannel();
  const host = remoteSession();
  playRemote(host, "host", channel.host.link, matchRulesFor(hostSettings));
  const guest = joinedGuest(channel);
  deliver(channel);
  return { channel, host, guest };
}

function remoteOf(session: ScreenSession): RemoteMatch {
  const remote = remotes.get(session);
  if (remote === undefined) {
    throw new Error("expected a remote match");
  }
  return remote;
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
    session.step(false);
    deliver(peers.channel);
  }
}

function stepBoth(peers: Peers, steps: number): void {
  for (let i = 0; i < steps; i++) {
    peers.host.step(false);
    peers.guest.step(false);
    deliver(peers.channel);
  }
}

function aimDeltaTo(match: Readonly<Match>, target: Aim): Aim {
  const aim = match.ships[match.activePlayer].aim;
  return { angle: target.angle - aim.angle, power: target.power - aim.power };
}

function findAim(match: Readonly<Match>, wanted: ShotResult): Aim {
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
      if (wanted === "hit" ? hitOpponent : missed) {
        return target;
      }
    }
  }
  throw new Error(`no aim found for a ${wanted}`);
}

function takeShot(peers: Peers, shooter: ScreenSession, wanted: ShotResult): void {
  settle(peers, shooter);
  const match = matchOf(shooter);
  if (match.phase.kind === "roundOver") {
    shooter.played().fire();
  }
  const target = findAim(match, wanted);
  shooter.played().aim(aimDeltaTo(match, target));
  shooter.played().fire();
  deliver(peers.channel);
}

function roundOverOnBoth(peers: Peers): RoundOverSessions {
  const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
  takeShot(peers, shooter, "hit");
  settle(peers, shooter);
  settle(peers, otherSession(peers, shooter));
  const next = sessionOf(peers, nextShooter(matchOf(shooter)));
  return { next, waiting: otherSession(peers, next) };
}

function stepsUntilMainMenu(session: ScreenSession): number {
  for (let steps = 1; steps <= MAX_STEPS; steps++) {
    session.step(false);
    if (navigationsOf(session).length > 0) {
      return steps;
    }
  }
  throw new Error("never returned to the main menu");
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

  test("the host's settings set the match rules both peers play under", () => {
    const hostSettings: Settings = { ...DEFAULT_SETTINGS, bounce: true, timeoutSeconds: 10 };

    const { host, guest } = connectedPeers(hostSettings);

    expect(matchOf(host).rules).toEqual(matchRulesFor(hostSettings));
    expect(matchOf(guest).rules).toEqual(matchRulesFor(hostSettings));
  });

  test("keeps both screens awake while the remote match is played", () => {
    const { host, guest } = connectedPeers();

    expect(host.keepsScreenAwake()).toBe(true);
    expect(guest.keepsScreenAwake()).toBe(true);
  });

  test("the guest waits for the host until the hello arrives", () => {
    const channel = fakeChannel();
    const guest = joinedGuest(channel);

    expect(remoteNotice(remoteOf(guest))).toBe("awaitingHost");
  });

  test("a hello from a different protocol version ends the match as a version mismatch", () => {
    const channel = fakeChannel();
    const guest = joinedGuest(channel);
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
      takeShot(peers, shooter, shot % 2 === 1 ? "hit" : "miss");
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

  test("in round over the waiting peer's key press has no effect on either side", () => {
    const peers = connectedPeers();
    const { waiting } = roundOverOnBoth(peers);
    const hostBefore = structuredClone(matchView(matchOf(peers.host)));
    const guestBefore = structuredClone(matchView(matchOf(peers.guest)));

    waiting.played().fire();
    deliver(peers.channel);

    expect(matchView(matchOf(peers.host))).toEqual(hostBefore);
    expect(matchView(matchOf(peers.guest))).toEqual(guestBefore);
  });

  test("the next shooter moves past round over first and the waiting peer follows into the same round", () => {
    const peers = connectedPeers();
    const { next, waiting } = roundOverOnBoth(peers);

    next.played().fire();
    const waitingPhaseBeforeDelivery = matchOf(waiting).phase.kind;
    deliver(peers.channel);

    expect(waitingPhaseBeforeDelivery).toBe("roundOver");
    expect(matchOf(next).roundNumber).toBe(2);
    expect(matchView(matchOf(waiting))).toEqual(matchView(matchOf(next)));
  });

  test("the waiting peer shows the next shooter's aim once the next round has started", () => {
    const peers = connectedPeers();
    const { next, waiting } = roundOverOnBoth(peers);
    const side = nextShooter(matchOf(next));

    next.played().fire();
    deliver(peers.channel);
    next.played().aim({ angle: 10, power: 20 });
    stepBoth(peers, 3);

    expect(matchOf(waiting).ships[side].aim).toEqual(matchOf(next).ships[side].aim);
    expect(matchOf(waiting).ships[side].aim).not.toEqual(DEFAULT_AIMS[side]);
  });

  test("an aim streamed in an earlier round is streamed again when the shooter returns to it", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    const side = matchOf(shooter).activePlayer;
    const earlierAim = findAim(matchOf(shooter), "hit");
    shooter.played().aim(aimDeltaTo(matchOf(shooter), earlierAim));
    stepBoth(peers, 3);
    shooter.played().fire();
    deliver(peers.channel);
    settle(peers, shooter);
    settle(peers, receiver);
    takeShot(peers, receiver, "miss");
    settle(peers, receiver);
    settle(peers, shooter);

    shooter.played().aim(aimDeltaTo(matchOf(shooter), earlierAim));
    stepBoth(peers, 3);

    expect(matchOf(shooter).roundNumber).toBe(2);
    expect(matchOf(receiver).ships[side].aim).toEqual(earlierAim);
  });

  test("a shot arriving while the receiver is still in flight is applied once that flight ends", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    takeShot(peers, shooter, "miss");
    settle(peers, receiver);

    takeShot(peers, receiver, "miss");
    const queuedWhileInFlight = matchOf(shooter).phase.kind === "inFlight" && remoteOf(shooter).receivedMoves.at(-1)?.kind === "shot";
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

    waiting.played().aim({ angle: 30, power: 50 });
    waiting.played().fire();
    deliver(peers.channel);

    expect(matchView(matchOf(peers.host))).toEqual(hostBefore);
    expect(matchView(matchOf(peers.guest))).toEqual(guestBefore);
  });

  test("streamed aim moves the opponent's ship on the receiving side", () => {
    const peers = connectedPeers();
    const shooter = sessionOf(peers, matchOf(peers.host).activePlayer);
    const receiver = otherSession(peers, shooter);
    const side = matchOf(shooter).activePlayer;

    shooter.played().aim({ angle: 10, power: 20 });
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

    takeShot(peers, shooter, "miss");
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

    leaveForMainMenu(peers.host);
    deliver(peers.channel);
    await flushPromises();

    expect(peers.host.screen()).toBe("mainMenu");
    expect(remoteNotice(remoteOf(peers.guest))).toBe("opponentLeft");
    expect(peers.channel.closed).toBe(true);
  });

  test("entering a new remote match over a running one closes the old link", async () => {
    const peers = connectedPeers();
    const next = fakeChannel();

    playRemote(peers.guest, "guest", next.guest.link, DEFAULT_MATCH_RULES);
    deliver(peers.channel);
    await flushPromises();

    expect(peers.channel.closed).toBe(true);
    expect(remoteNotice(remoteOf(peers.host))).toBe("opponentLeft");
    expect(remoteOf(peers.guest).link).toBe(next.guest.link);
  });
});

describe("returning to the main menu", () => {
  const endings: EndingCase[] = [
    {
      end: "opponentLeft",
      endMatch: () => {
        const peers = connectedPeers();
        sendRaw(peers.channel, peers.channel.guest, { kind: "leave" });
        return peers.guest;
      },
    },
    {
      end: "outOfSync",
      endMatch: () => {
        const peers = connectedPeers();
        const shot: RemoteMessage = { kind: "shot", aim: { angle: 0, power: 999 }, shot: { x: 0, y: 0, vx: 0, vy: 0 } };
        peers.channel.guest.inbox.push(encodeMessage(shot));
        deliver(peers.channel);
        return peers.guest;
      },
    },
    {
      end: "versionMismatch",
      endMatch: () => {
        const channel = fakeChannel();
        const guest = joinedGuest(channel);
        sendRaw(channel, channel.guest, { kind: "hello", protocolVersion: 999, rules: {}, seed: 1 });
        return guest;
      },
    },
  ];

  test.each(endings)("$end asks for the main menu once its notice has run out", ({ end, endMatch }) => {
    const session = endMatch();
    const ended = remoteOf(session);

    expect(ended.end).toBe(end);
    expect(stepsUntilMainMenu(session)).toBe(END_NOTICE_STEPS);
  });

  test("leaving is itself the return to the main menu, and the opponent follows once its notice has run out", async () => {
    const peers = connectedPeers();
    const leaving = remoteOf(peers.host);

    leaveForMainMenu(peers.host);
    deliver(peers.channel);
    await flushPromises();

    expect(leaving.end).toBe("left");
    expect(peers.host.screen()).toBe("mainMenu");
    peers.host.step(false);
    expect(navigationsOf(peers.host)).toEqual([]);
    expect(stepsUntilMainMenu(peers.guest)).toBe(END_NOTICE_STEPS);
  });
});
