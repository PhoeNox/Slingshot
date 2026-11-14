// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export type Feed<Event> = (event: Event) => Promise<void>;

export type Transition<Event, Effect> = (event: Event) => readonly Effect[];

export type Perform<Event, Effect> = (effect: Effect, feed: Feed<Event>) => Promise<Event> | void;

export function effectLoop<Event, Effect>(transition: Transition<Event, Effect>, perform: Perform<Event, Effect>): Feed<Event> {
  const feed: Feed<Event> = (event) => {
    const effects = transition(event);
    const fedBack: Promise<void>[] = [];
    for (const effect of effects) {
      const arrival = perform(effect, feed);
      if (arrival instanceof Promise) {
        fedBack.push(arrival.then(feed));
      }
    }
    return Promise.all(fedBack).then(() => undefined);
  };
  return feed;
}
