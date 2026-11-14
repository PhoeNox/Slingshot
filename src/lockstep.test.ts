// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { adjustAim, DEFAULT_MATCH_RULES, type AimDelta, fire, isShotInFlight, matchView, nextShooter, step, type Aim, type Match } from "./core/match";
import {
  isEndNoticeOver,
  lockstepTransition,
  newLockstep,
  remoteNotice,
  type Lockstep,
  type LockstepEffect,
  type RemoteMatchEnd,
} from "./lockstep";
import { PROTOCOL_VERSION, type OutcomeMessage, type RejectionReason, type RemoteMessage } from "./remoteProtocol";

interface Peers {
  host: Lockstep;
  guest: Lockstep;
}

interface Turn {
  shooter: Lockstep;
  receiver: Lockstep;
}

interface LocalEnding {
  end: RemoteMatchEnd;
  outgoing: RemoteMessage[];
}

interface Rejection {
  reason: RejectionReason;
  end: RemoteMatchEnd;
}

type ShotResult = "hit" | "miss";

const SEED = 7;
const MAX_STEPS = 5000;
const AIM_SEND_INTERVAL_STEPS = 3;
const END_NOTICE_STEPS = 90;
const ANGLES = Array.from({ length: 180 }, (_, i) => i * 2);
const POWERS = [100, 150, 200, 250, 300];
const NOTHING: LockstepEffect[] = [];
const LEAVE: RemoteMessage = { kind: "leave" };
const INVALID_SHOT: RemoteMessage = { kind: "shot", aim: { angle: 0, power: 999 }, shot: { x: 0, y: 0, vx: 0, vy: 0 } };

function sending(message: RemoteMessage): LockstepEffect {
  return { kind: "send", message };
}

function ending(end: RemoteMatchEnd): LockstepEffect {
  return { kind: "end", end };
}

function endedSendingLeave(end: RemoteMatchEnd): LockstepEffect[] {
  return [sending(LEAVE), ending(end)];
}

function sent(effects: LockstepEffect[]): RemoteMessage[] {
  return effects.flatMap((effect) => (effect.kind === "send" ? [effect.message] : []));
}

function hostMatch(lockstep: Lockstep): LockstepEffect[] {
  return lockstepTransition(lockstep, { kind: "hosted", seed: SEED, rules: DEFAULT_MATCH_RULES });
}

function aimBy(lockstep: Lockstep, delta: AimDelta): void {
  lockstepTransition(lockstep, { kind: "aimed", delta });
}

function fireLocal(lockstep: Lockstep): LockstepEffect[] {
  return lockstepTransition(lockstep, { kind: "fired" });
}

function stepOnce(lockstep: Lockstep): LockstepEffect[] {
  return lockstepTransition(lockstep, { kind: "stepped" });
}

function endLocally(lockstep: Lockstep, end: RemoteMatchEnd): LockstepEffect[] {
  return lockstepTransition(lockstep, { kind: "ended", end });
}

function receive(lockstep: Lockstep, message: RemoteMessage): LockstepEffect[] {
  return lockstepTransition(lockstep, { kind: "received", decoded: { accepted: true, message } });
}

function relay(effects: LockstepEffect[], to: Lockstep): void {
  for (const message of sent(effects)) {
    receive(to, message);
  }
}

function relayAll(results: LockstepEffect[][], to: Lockstep): void {
  for (const result of results) {
    relay(result, to);
  }
}

function connectedPeers(): Peers {
  const host = newLockstep("left");
  const guest = newLockstep("right");
  relay(hostMatch(host), guest);
  return { host, guest };
}

function matchOf(lockstep: Lockstep): Match {
  if (lockstep.match === undefined) {
    throw new Error("expected a started match");
  }
  return lockstep.match;
}

function turnOf(peers: Peers): Turn {
  return nextShooter(matchOf(peers.host)) === "left"
    ? { shooter: peers.host, receiver: peers.guest }
    : { shooter: peers.guest, receiver: peers.host };
}

function aimFor(match: Readonly<Match>, wanted: ShotResult): Aim {
  for (const angle of ANGLES) {
    for (const power of POWERS) {
      const trial = structuredClone(match) as Match;
      const aim = trial.ships[trial.activePlayer].aim;
      adjustAim(trial, { angle: angle - aim.angle, power: power - aim.power });
      const shooter = trial.activePlayer;
      fire(trial);
      for (let i = 0; i < MAX_STEPS && trial.phase.kind === "inFlight"; i++) {
        step(trial);
      }
      const hitOpponent = trial.phase.kind === "roundOver" && trial.phase.result.hitShip !== shooter;
      const missed = trial.phase.kind === "aiming";
      if (wanted === "hit" ? hitOpponent : missed) {
        return { angle, power };
      }
    }
  }
  throw new Error(`no aim found for a ${wanted}`);
}

function aimAt(lockstep: Lockstep, target: Aim): void {
  const aim = matchOf(lockstep).ships[lockstep.localSide].aim;
  aimBy(lockstep, { angle: target.angle - aim.angle, power: target.power - aim.power });
}

function shoot(lockstep: Lockstep, wanted: ShotResult): LockstepEffect[] {
  const target = aimFor(matchOf(lockstep), wanted);
  aimAt(lockstep, target);
  return fireLocal(lockstep);
}

function stepTimes(lockstep: Lockstep, steps: number): LockstepEffect[][] {
  return Array.from({ length: steps }, () => stepOnce(lockstep));
}

function flyOut(lockstep: Lockstep): LockstepEffect[][] {
  const results: LockstepEffect[][] = [];
  for (let i = 0; i < MAX_STEPS && isShotInFlight(matchOf(lockstep)); i++) {
    results.push(stepOnce(lockstep));
  }
  return results;
}

function outgoingOf(results: LockstepEffect[][]): RemoteMessage[] {
  return results.flatMap(sent);
}

function playShot(peers: Peers, wanted: ShotResult): void {
  const { shooter, receiver } = turnOf(peers);
  relay(shoot(shooter, wanted), receiver);
  const shooterSteps = flyOut(shooter);
  const receiverSteps = flyOut(receiver);
  relayAll(shooterSteps, receiver);
  relayAll(receiverSteps, shooter);
}

function outcomeOf(results: LockstepEffect[][]): OutcomeMessage {
  const outcome = outgoingOf(results).find((message) => message.kind === "outcome");
  if (outcome?.kind !== "outcome") {
    throw new Error("expected an outcome");
  }
  return outcome;
}

describe("starting a lockstep match", () => {
  test("the host creates its match and sends a hello with the seed and rules", () => {
    const host = newLockstep("left");

    const hosted = hostMatch(host);

    expect(hosted).toEqual([sending({ kind: "hello", protocolVersion: PROTOCOL_VERSION, rules: DEFAULT_MATCH_RULES, seed: SEED })]);
    expect(remoteNotice(host)).toBeUndefined();
  });

  test("the guest awaits the host until the hello, then plays the host's match", () => {
    const host = newLockstep("left");
    const guest = newLockstep("right");
    const hosted = hostMatch(host);
    const awaiting = remoteNotice(guest);

    relay(hosted, guest);

    expect(awaiting).toBe("awaitingHost");
    expect(remoteNotice(guest)).toBeUndefined();
    expect(matchView(matchOf(guest))).toEqual(matchView(matchOf(host)));
  });

  test("a second hello ends the match as out of sync", () => {
    const { guest } = connectedPeers();

    const received = receive(guest, { kind: "hello", protocolVersion: PROTOCOL_VERSION, rules: DEFAULT_MATCH_RULES, seed: 1 });

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });

  test("a move before the hello ends the match as out of sync", () => {
    const guest = newLockstep("right");

    const received = receive(guest, { kind: "aim", aim: { angle: 10, power: 20 } });

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });

  test("fire before the hello does nothing", () => {
    const guest = newLockstep("right");

    expect(fireLocal(guest)).toEqual(NOTHING);
  });
});

describe("local input", () => {
  test("aim and fire on the local turn launch the shot and send it with its aim", () => {
    const { shooter } = turnOf(connectedPeers());
    const target = aimFor(matchOf(shooter), "miss");

    aimAt(shooter, target);
    const fired = fireLocal(shooter);

    expect(isShotInFlight(matchOf(shooter))).toBe(true);
    expect(fired).toEqual([sending({ kind: "shot", aim: target, shot: expect.any(Object) })]);
  });

  test("aim and fire on the opponent's turn change nothing and send nothing", () => {
    const { receiver } = turnOf(connectedPeers());
    const before = structuredClone(matchView(matchOf(receiver)));

    aimBy(receiver, { angle: 30, power: 50 });
    const fired = fireLocal(receiver);

    expect(fired).toEqual(NOTHING);
    expect(matchView(matchOf(receiver))).toEqual(before);
  });
});

describe("aim streaming", () => {
  test("a changed aim is sent on every third step", () => {
    const { shooter } = turnOf(connectedPeers());
    aimBy(shooter, { angle: 10, power: 20 });

    const stepped = stepTimes(shooter, AIM_SEND_INTERVAL_STEPS);

    const aim = matchOf(shooter).ships[shooter.localSide].aim;
    expect(stepped.map(sent)).toEqual([[], [], [{ kind: "aim", aim }]]);
  });

  test("an aim changing on every step is sent only once per interval", () => {
    const { shooter } = turnOf(connectedPeers());
    const stepped: LockstepEffect[][] = [];

    for (let i = 0; i < AIM_SEND_INTERVAL_STEPS * 2; i++) {
      aimBy(shooter, { angle: 1, power: 0 });
      stepped.push(stepOnce(shooter));
    }

    expect(outgoingOf(stepped).map((message) => message.kind)).toEqual(["aim", "aim"]);
  });

  test("an unchanged aim is not sent again", () => {
    const { shooter } = turnOf(connectedPeers());
    aimBy(shooter, { angle: 10, power: 20 });
    stepTimes(shooter, AIM_SEND_INTERVAL_STEPS);

    const stepped = stepTimes(shooter, AIM_SEND_INTERVAL_STEPS * 2);

    expect(outgoingOf(stepped)).toEqual([]);
  });

  test("the streamed aim moves the opponent's ship on the receiving side", () => {
    const { shooter, receiver } = turnOf(connectedPeers());
    aimBy(shooter, { angle: 10, power: 20 });

    relayAll(stepTimes(shooter, AIM_SEND_INTERVAL_STEPS), receiver);

    const side = shooter.localSide;
    expect(matchOf(receiver).ships[side].aim).toEqual(matchOf(shooter).ships[side].aim);
  });
});

describe("opponent moves", () => {
  test("a received shot launches the opponent's shot", () => {
    const { shooter, receiver } = turnOf(connectedPeers());

    relay(shoot(shooter, "miss"), receiver);

    expect(isShotInFlight(matchOf(receiver))).toBe(true);
    expect(matchOf(receiver).attempts).toEqual(matchOf(shooter).attempts);
  });

  test("moves received during the local flight wait until it ends, then apply in order", () => {
    const { shooter, receiver } = turnOf(connectedPeers());
    relay(shoot(shooter, "miss"), receiver);
    flyOut(receiver);
    aimBy(receiver, { angle: 10, power: 20 });
    relayAll(stepTimes(receiver, AIM_SEND_INTERVAL_STEPS), shooter);
    relay(shoot(receiver, "miss"), shooter);
    const queued = shooter.receivedMoves.map((move) => move.kind);
    const queuedInFlight = isShotInFlight(matchOf(shooter));

    for (let i = 0; i < MAX_STEPS && shooter.receivedMoves.length > 0; i++) {
      stepOnce(shooter);
    }

    expect(queued).toEqual(["aim", "shot"]);
    expect(queuedInFlight).toBe(true);
    expect(isShotInFlight(matchOf(shooter))).toBe(true);
    expect(matchOf(shooter).attempts).toEqual(matchOf(receiver).attempts);
    expect(shooter.end).toBeUndefined();
  });

  test("a shot received on the local player's turn ends the match as out of sync", () => {
    const { shooter } = turnOf(connectedPeers());
    const aim = matchOf(shooter).ships[shooter.localSide].aim;

    const received = receive(shooter, { kind: "shot", aim, shot: { x: 0, y: 0, vx: 0, vy: 0 } });

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });

  test("an invalid shot ends the match as out of sync", () => {
    const { receiver } = turnOf(connectedPeers());

    const received = receive(receiver, INVALID_SHOT);

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });
});

describe("round starts", () => {
  test("only the next shooter starts the next round, and the opponent follows into it", () => {
    const peers = connectedPeers();
    playShot(peers, "hit");
    const { shooter: next, receiver: waiting } = turnOf(peers);
    const waitingBefore = structuredClone(matchView(matchOf(waiting)));

    const waitingFired = fireLocal(waiting);
    const nextFired = fireLocal(next);
    relay(nextFired, waiting);

    expect(waitingFired).toEqual(NOTHING);
    expect(waitingBefore.phase.kind).toBe("roundOver");
    expect(nextFired).toEqual([sending({ kind: "nextRound" })]);
    expect(matchOf(next).roundNumber).toBe(2);
    expect(matchView(matchOf(waiting))).toEqual(matchView(matchOf(next)));
  });

  test("a round start from the waiting peer ends the match as out of sync", () => {
    const peers = connectedPeers();
    playShot(peers, "hit");
    const { shooter: next } = turnOf(peers);

    const received = receive(next, { kind: "nextRound" });

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });
});

describe("outcome comparison", () => {
  test("each shooter sends its outcome, and agreeing outcomes keep the match running", () => {
    const peers = connectedPeers();
    const { shooter, receiver } = turnOf(peers);
    relay(shoot(shooter, "miss"), receiver);
    const shooterSteps = flyOut(shooter);
    const receiverSteps = flyOut(receiver);

    relayAll(shooterSteps, receiver);
    relayAll(receiverSteps, shooter);

    expect(outcomeOf(shooterSteps)).toEqual(outcomeOf(receiverSteps));
    expect(peers.host.end).toBeUndefined();
    expect(peers.guest.end).toBeUndefined();
  });

  test("a disagreeing outcome ends the match as out of sync", () => {
    const { shooter, receiver } = turnOf(connectedPeers());
    relay(shoot(shooter, "miss"), receiver);
    const { outcome } = outcomeOf(flyOut(shooter));
    flyOut(receiver);

    const received = receive(receiver, { kind: "outcome", outcome: { ...outcome, stepsFlown: outcome.stepsFlown + 1 } });

    expect(received).toEqual(endedSendingLeave("outOfSync"));
  });

  test("an outcome received during the local flight is compared once that flight ends", () => {
    const { shooter, receiver } = turnOf(connectedPeers());
    relay(shoot(shooter, "miss"), receiver);
    const { outcome } = outcomeOf(flyOut(shooter));

    const received = receive(receiver, { kind: "outcome", outcome: { ...outcome, stepsFlown: outcome.stepsFlown + 1 } });
    const flown = flyOut(receiver);

    expect(received).toEqual(NOTHING);
    expect(flown.at(-1)).toEqual([sending(outcomeOf(flown)), ...endedSendingLeave("outOfSync")]);
  });
});

describe("endings", () => {
  const localEndings: LocalEnding[] = [
    { end: "left", outgoing: [LEAVE] },
    { end: "opponentLeft", outgoing: [] },
    { end: "outOfSync", outgoing: [LEAVE] },
  ];

  const rejections: Rejection[] = [
    { reason: "malformed", end: "outOfSync" },
    { reason: "protocolMismatch", end: "versionMismatch" },
  ];

  test.each(localEndings)("ending locally as $end tells the opponent unless it left", ({ end, outgoing }) => {
    const { host } = connectedPeers();

    expect(endLocally(host, end)).toEqual([...outgoing.map(sending), ending(end)]);
  });

  test("a received leave ends the match as opponent left without a reply", () => {
    const { guest } = connectedPeers();

    expect(receive(guest, LEAVE)).toEqual([ending("opponentLeft")]);
  });

  test.each(rejections)("a $reason rejection ends the match as $end", ({ reason, end }) => {
    const { guest } = connectedPeers();

    const received = lockstepTransition(guest, { kind: "received", decoded: { accepted: false, reason, detail: "rejected" } });

    expect(received).toEqual(endedSendingLeave(end));
  });

  test("after an ending, messages, input, steps and further endings send nothing", () => {
    const { shooter } = turnOf(connectedPeers());
    endLocally(shooter, "outOfSync");

    aimBy(shooter, { angle: 10, power: 20 });
    const results = [
      receive(shooter, LEAVE),
      fireLocal(shooter),
      ...stepTimes(shooter, AIM_SEND_INTERVAL_STEPS),
      endLocally(shooter, "left"),
    ];

    expect(results.every((result) => result.length === 0)).toBe(true);
    expect(shooter.end).toBe("outOfSync");
    expect(isShotInFlight(matchOf(shooter))).toBe(false);
  });

  test("leaving shows no notice, any other ending shows itself", () => {
    const left = connectedPeers().host;
    const outOfSync = connectedPeers().host;

    endLocally(left, "left");
    endLocally(outOfSync, "outOfSync");

    expect(remoteNotice(left)).toBeUndefined();
    expect(remoteNotice(outOfSync)).toBe("outOfSync");
  });

  test("the end notice runs out a fixed number of steps after the ending", () => {
    const { host } = connectedPeers();
    stepTimes(host, END_NOTICE_STEPS);
    const overBeforeEnding = isEndNoticeOver(host);
    endLocally(host, "opponentLeft");

    stepTimes(host, END_NOTICE_STEPS - 1);
    const overJustBefore = isEndNoticeOver(host);
    stepOnce(host);

    expect(overBeforeEnding).toBe(false);
    expect(overJustBefore).toBe(false);
    expect(isEndNoticeOver(host)).toBe(true);
  });
});
