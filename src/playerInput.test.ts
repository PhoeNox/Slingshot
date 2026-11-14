// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { ANGLE_STEP, POWER_STEP, REPEAT_DELAY_MS, REPEAT_INTERVAL_MS } from "./aimKeyRepeat";
import { createAttractMode } from "./core/attract";
import {
  activeSide,
  aimOf,
  createMatch,
  DEFAULT_MATCH_RULES,
  isAiming,
  isShotInFlight,
  opponentOf,
  type Aim,
  type Match,
  type RoundLayout,
  type Side,
} from "./core/match";
import type { PeerLink } from "./peerConnection";
import { playAttractMode, playHotSeat, type PlayedMatch } from "./playedMatch";
import { createPlayerInput, type InputClock, type PlayerInput } from "./playerInput";
import { playRemoteMatch, startRemoteMatch, type RemoteMatch } from "./remoteMatch";
import { ANGLE_STEP_PX, POWER_STEP_PX } from "./touchAim";

interface FakeClock extends InputClock {
  advance: (ms: number) => void;
  pendingTimers: () => number;
}

interface Timer {
  id: number;
  dueAt: number;
  callback: () => void;
}

interface Endpoint {
  link: PeerLink;
  inbox: string[];
  listener: ((text: string) => void) | undefined;
}

interface RemotePeers {
  host: RemoteMatch;
  guest: RemoteMatch;
  deliver: () => void;
}

interface Player {
  source: { played: PlayedMatch };
  input: PlayerInput;
  clock: FakeClock;
}

const ORIGIN = { x: 100, y: 100 };
const SEED = 3;
const MAX_FLIGHT_STEPS = 5000;
const UPWARD_LAYOUT: RoundLayout = {
  ships: {
    left: { x: 40, y: 300, aim: { angle: 0, power: 300 } },
    right: { x: 760, y: 300, aim: { angle: 0, power: 300 } },
  },
  planets: [],
};

function fakeClock(): FakeClock {
  let now = 0;
  let nextId = 1;
  let timers: Timer[] = [];
  return {
    now: () => now,
    startTimer: (callback, delayMs) => {
      const timer = { id: nextId++, dueAt: now + delayMs, callback };
      timers.push(timer);
      return timer.id;
    },
    cancelTimer: (id) => {
      timers = timers.filter((timer) => timer.id !== id);
    },
    advance: (ms) => {
      const until = now + ms;
      let due = timers.find((timer) => timer.dueAt <= until);
      while (due !== undefined) {
        now = due.dueAt;
        timers = timers.filter((timer) => timer !== due);
        due.callback();
        due = timers.find((timer) => timer.dueAt <= until);
      }
      now = until;
    },
    pendingTimers: () => timers.length,
  };
}

function playerOf(played: PlayedMatch): Player {
  const source = { played };
  const clock = fakeClock();
  const input = createPlayerInput(source, clock);
  return { source, input, clock };
}

function hotSeatMatch(): Match {
  return createMatch(SEED, structuredClone(UPWARD_LAYOUT));
}

function attractMode(): PlayedMatch {
  const attract = createAttractMode(SEED);
  return playAttractMode(attract, "mainMenu");
}

function drag(input: PlayerInput, dx: number, dy: number): void {
  input.pointerMove(1, { x: ORIGIN.x + dx, y: ORIGIN.y + dy });
}

function pressAt(input: PlayerInput): void {
  input.pointerDown(1, ORIGIN);
}

function raisedAngle(side: Side, steps: number): number {
  return side === "left" ? -steps * ANGLE_STEP : steps * ANGLE_STEP;
}

function bothAims(match: Readonly<Match>): Record<Side, Aim> {
  return { left: aimOf(match, "left"), right: aimOf(match, "right") };
}

function settleHotSeat(played: PlayedMatch, match: Readonly<Match>): void {
  for (let i = 0; i < MAX_FLIGHT_STEPS && isShotInFlight(match); i++) {
    played.step(false);
  }
}

function linkedEndpoints(): [Endpoint, Endpoint] {
  const closed = new Promise<void>(() => {});
  const endpoint = (deliverTo: () => Endpoint): Endpoint => {
    const end: Endpoint = {
      inbox: [],
      listener: undefined,
      link: {
        send: (text) => deliverTo().inbox.push(text),
        onMessage: (listener) => {
          end.listener = listener;
        },
        closed,
        close: () => {},
      },
    };
    return end;
  };
  const host: Endpoint = endpoint(() => guest);
  const guest: Endpoint = endpoint(() => host);
  return [host, guest];
}

function remotePeers(): RemotePeers {
  const [hostEnd, guestEnd] = linkedEndpoints();
  const host = startRemoteMatch("host", hostEnd.link, SEED, DEFAULT_MATCH_RULES);
  const guest = startRemoteMatch("guest", guestEnd.link, SEED, DEFAULT_MATCH_RULES);
  const deliver = () => {
    while (hostEnd.inbox.length > 0 || guestEnd.inbox.length > 0) {
      for (const end of [hostEnd, guestEnd]) {
        for (const text of end.inbox.splice(0)) {
          end.listener!(text);
        }
      }
    }
  };
  deliver();
  return { host, guest, deliver };
}

function remoteOn(peers: RemotePeers, side: Side): RemoteMatch {
  return side === "left" ? peers.host : peers.guest;
}

function startedMatchOf(remote: Readonly<RemoteMatch>): Match {
  if (remote.match === undefined) {
    throw new Error("expected a started remote match");
  }
  return remote.match;
}

describe("keyboard", () => {
  test("an aim key aims the hot-seat active player's ship and is consumed", () => {
    const match = hotSeatMatch();
    const side = activeSide(match);
    const { input } = playerOf(playHotSeat(match));

    const consumed = input.keyDown({ code: "ArrowUp", shiftKey: false, repeat: false });

    expect(consumed).toBe(true);
    expect(aimOf(match, side).power).toBe(UPWARD_LAYOUT.ships[side].aim.power + POWER_STEP);
  });

  test("a held aim key repeats on the clock until released", () => {
    const match = hotSeatMatch();
    const side = activeSide(match);
    const { input, clock } = playerOf(playHotSeat(match));

    input.keyDown({ code: "ArrowRight", shiftKey: false, repeat: false });
    clock.advance(REPEAT_DELAY_MS + REPEAT_INTERVAL_MS);
    input.keyUp({ code: "ArrowRight", shiftKey: false });
    clock.advance(REPEAT_DELAY_MS);

    expect(aimOf(match, side).angle).toBe(3 * ANGLE_STEP);
    expect(clock.pendingTimers()).toBe(0);
  });

  test("a fire key fires the match", () => {
    const match = hotSeatMatch();
    const { input } = playerOf(playHotSeat(match));

    input.keyDown({ code: "Space", shiftKey: false, repeat: false });

    expect(isShotInFlight(match)).toBe(true);
  });

  test("keys are neither consumed nor repeated in attract mode", () => {
    const { input, clock } = playerOf(attractMode());

    const consumed = input.keyDown({ code: "ArrowUp", shiftKey: false, repeat: false });

    expect(consumed).toBe(false);
    expect(clock.pendingTimers()).toBe(0);
  });

  test("a repeat during the shot's flight changes no aim", () => {
    const match = hotSeatMatch();
    const { input, clock } = playerOf(playHotSeat(match));
    input.keyDown({ code: "ArrowRight", shiftKey: false, repeat: false });
    input.keyDown({ code: "Space", shiftKey: false, repeat: false });
    const before = bothAims(match);

    clock.advance(REPEAT_DELAY_MS + 5 * REPEAT_INTERVAL_MS);

    expect(isShotInFlight(match)).toBe(true);
    expect(bothAims(match)).toEqual(before);
  });

  test("a repeat after leaving the match stops without aiming", () => {
    const match = hotSeatMatch();
    const player = playerOf(playHotSeat(match));
    player.input.keyDown({ code: "ArrowRight", shiftKey: false, repeat: false });
    const before = bothAims(match);

    player.source.played = attractMode();
    player.clock.advance(REPEAT_DELAY_MS);

    expect(bothAims(match)).toEqual(before);
    expect(player.clock.pendingTimers()).toBe(0);
  });
});

describe("hot-seat touch", () => {
  test("a drag aims the active player's ship and leaves the other alone", () => {
    const match = hotSeatMatch();
    const side = activeSide(match);
    const other = opponentOf(side);
    const { input } = playerOf(playHotSeat(match));

    pressAt(input);
    drag(input, 0, -ANGLE_STEP_PX * 2);

    expect(aimOf(match, side).angle).toBe((360 + raisedAngle(side, 2)) % 360);
    expect(aimOf(match, other)).toEqual(UPWARD_LAYOUT.ships[other].aim);
  });

  test("a tap fires", () => {
    const match = hotSeatMatch();
    const { input } = playerOf(playHotSeat(match));

    pressAt(input);
    input.pointerUp(1);

    expect(isShotInFlight(match)).toBe(true);
  });

  test("a drag stops aiming once the turn changes, even on the next player's turn", () => {
    const match = hotSeatMatch();
    const played = playHotSeat(match);
    const shooter = activeSide(match);
    const { input } = playerOf(played);
    pressAt(input);
    drag(input, POWER_STEP_PX, 0);
    played.fire();
    const fired = bothAims(match);

    drag(input, POWER_STEP_PX * 2, 0);
    settleHotSeat(played, match);
    drag(input, POWER_STEP_PX * 3, 0);
    input.pointerUp(1);

    expect(isAiming(match)).toBe(true);
    expect(activeSide(match)).toBe(opponentOf(shooter));
    expect(bothAims(match)).toEqual(fired);
  });
});

describe("leaving the match mid-touch", () => {
  test("a release after leaving for a menu never fires", () => {
    const match = hotSeatMatch();
    const player = playerOf(playHotSeat(match));
    pressAt(player.input);

    player.source.played = attractMode();
    player.input.pointerUp(1);

    expect(isAiming(match)).toBe(true);
  });

  test("a release on a newly entered match never fires it", () => {
    const player = playerOf(playHotSeat(hotSeatMatch()));
    pressAt(player.input);
    const next = hotSeatMatch();

    player.source.played = playHotSeat(next);
    player.input.pointerUp(1);

    expect(isAiming(next)).toBe(true);
  });

  test("a drag after leaving changes no aim", () => {
    const match = hotSeatMatch();
    const player = playerOf(playHotSeat(match));
    pressAt(player.input);
    const before = bothAims(match);

    player.source.played = attractMode();
    drag(player.input, 0, -ANGLE_STEP_PX * 2);
    player.source.played = playHotSeat(match);
    drag(player.input, 0, -ANGLE_STEP_PX * 4);

    expect(bothAims(match)).toEqual(before);
  });
});

describe("remote touch", () => {
  test("a drag on the local turn aims the local ship", () => {
    const peers = remotePeers();
    const shooter = activeSide(startedMatchOf(peers.host));
    const remote = remoteOn(peers, shooter);
    const match = startedMatchOf(remote);
    const before = aimOf(match, shooter);
    const { input } = playerOf(playRemoteMatch(remote));

    pressAt(input);
    drag(input, 0, -ANGLE_STEP_PX * 2);

    expect(aimOf(match, shooter).angle).toBe((before.angle + raisedAngle(shooter, 2) + 360) % 360);
  });

  test("a drag or tap on the opponent's turn changes nothing", () => {
    const peers = remotePeers();
    const shooter = activeSide(startedMatchOf(peers.host));
    const remote = remoteOn(peers, opponentOf(shooter));
    const match = startedMatchOf(remote);
    const before = bothAims(match);
    const { input } = playerOf(playRemoteMatch(remote));

    pressAt(input);
    drag(input, 0, -ANGLE_STEP_PX * 2);
    input.pointerUp(1);
    pressAt(input);
    input.pointerUp(1);
    peers.deliver();

    expect(bothAims(match)).toEqual(before);
    expect(isAiming(match)).toBe(true);
  });

  test("a held key repeating on the opponent's turn changes nothing", () => {
    const peers = remotePeers();
    const shooter = activeSide(startedMatchOf(peers.host));
    const remote = remoteOn(peers, opponentOf(shooter));
    const match = startedMatchOf(remote);
    const before = bothAims(match);
    const { input, clock } = playerOf(playRemoteMatch(remote));

    input.keyDown({ code: "ArrowRight", shiftKey: false, repeat: false });
    clock.advance(REPEAT_DELAY_MS + 5 * REPEAT_INTERVAL_MS);

    expect(bothAims(match)).toEqual(before);
  });
});
