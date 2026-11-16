// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

export type SoundName = "music" | "launch" | "planetImpact" | "shipExplosion" | "menuSelect";

export type Sounds = Readonly<Record<SoundName, AudioBuffer>>;

export interface Music {
  keepPlaying: (playing: boolean) => void;
}

// Events that count as a user activation in every target browser, so resuming the context inside them is allowed.
const ACTIVATION_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

export function bindAudioContext(window: Window, context: AudioContext): void {
  let activated = false;
  const resumeWhenVisible = () => {
    if (activated && window.document.visibilityState === "visible") {
      void context.resume();
    }
  };
  const activate = () => {
    activated = true;
    resumeWhenVisible();
  };
  for (const type of ACTIVATION_EVENTS) {
    window.addEventListener(type, activate);
  }
  window.document.addEventListener("visibilitychange", () => {
    if (window.document.visibilityState === "hidden") {
      void context.suspend();
    } else {
      resumeWhenVisible();
    }
  });
  void context.suspend();
}

export function loopedMusic(context: AudioContext, loop: AudioBuffer): Music {
  const gain = context.createGain();
  gain.connect(context.destination);
  const source = context.createBufferSource();
  source.buffer = loop;
  source.loop = true;
  source.connect(gain);
  source.start();
  return {
    keepPlaying: (playing) => {
      gain.gain.value = playing ? 1 : 0;
    },
  };
}
