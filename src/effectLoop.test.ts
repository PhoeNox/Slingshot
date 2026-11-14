// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { effectLoop, type Feed } from "./effectLoop";

type Effect =
  | { kind: "note"; text: string }
  | { kind: "await"; arrival: Promise<string> }
  | { kind: "later" }
  | { kind: "throw"; error: unknown };

interface Harness {
  feed: Feed<string>;
  events: string[];
  notes: string[];
  later: (() => void)[];
}

function harness(rules: Record<string, Effect[]>): Harness {
  const h: Harness = { events: [], notes: [], later: [] } as unknown as Harness;
  const transition = (event: string) => {
    h.events.push(event);
    return rules[event] ?? [];
  };
  const perform = (effect: Effect, feed: Feed<string>): Promise<string> | void => {
    if (effect.kind === "note") {
      h.notes.push(effect.text);
    } else if (effect.kind === "await") {
      return effect.arrival;
    } else if (effect.kind === "later") {
      h.later.push(() => {
        feed("late");
      });
    } else {
      throw effect.error;
    }
  };
  h.feed = effectLoop(transition, perform);
  return h;
}

describe("feeding an event", () => {
  test("performs the effects its transition returns, in order", async () => {
    const h = harness({ start: [{ kind: "note", text: "a" }, { kind: "note", text: "b" }] });

    const fed = h.feed("start");

    expect(h.notes).toEqual(["a", "b"]);
    await expect(fed).resolves.toBeUndefined();
  });

  test("feeds each arrival back as an event and settles once those are fed back", async () => {
    const h = harness({
      start: [{ kind: "await", arrival: Promise.resolve("arrived") }],
      arrived: [{ kind: "await", arrival: Promise.resolve("arrivedAgain") }],
      arrivedAgain: [{ kind: "note", text: "done" }],
    });

    await h.feed("start");

    expect(h.events).toEqual(["start", "arrived", "arrivedAgain"]);
    expect(h.notes).toEqual(["done"]);
  });

  test("feeds a stale arrival back after the event that made it stale", async () => {
    let arrive!: (event: string) => void;
    const arrival = new Promise<string>((resolve) => {
      arrive = resolve;
    });
    const h = harness({ start: [{ kind: "await", arrival }] });

    const fed = h.feed("start");
    await h.feed("left");
    arrive("arrived");
    await fed;

    expect(h.events).toEqual(["start", "left", "arrived"]);
  });

  test("runs an event an effect feeds later through the transition", async () => {
    const h = harness({ start: [{ kind: "later" }], late: [{ kind: "note", text: "late" }] });

    await h.feed("start");
    h.later[0]();

    expect(h.events).toEqual(["start", "late"]);
    expect(h.notes).toEqual(["late"]);
  });
});

describe("an unexpected failure", () => {
  test("thrown by an effect of a fed-back event rejects the feed whose chain met it", async () => {
    const failure = new Error("boom");
    const h = harness({
      start: [{ kind: "await", arrival: Promise.resolve("failed") }],
      failed: [{ kind: "note", text: "shown" }, { kind: "throw", error: failure }],
    });

    await expect(h.feed("start")).rejects.toBe(failure);
    await expect(h.feed("other")).resolves.toBeUndefined();
    expect(h.notes).toEqual(["shown"]);
  });

  test("rejecting an arrival rejects the feed without feeding an event", async () => {
    const failure = new Error("boom");
    const h = harness({ start: [{ kind: "await", arrival: Promise.reject(failure) }] });

    await expect(h.feed("start")).rejects.toBe(failure);
    expect(h.events).toEqual(["start"]);
  });
});
