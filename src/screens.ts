// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { COLOURS } from "./colours";
import type { PlanetCountRange } from "./core/match";
import { canEnterFullscreen, enterLandscapeFullscreen, isFullscreen, toggleLandscapeFullscreen } from "./fullscreen";
import { backTargetFor, hashFor, moveFocus, resolveHash, showsMatch, type FixedRouteScreen, type FocusStep, type MenuItem, type Route, type Screen } from "./navigation";
import { scrambleLabel } from "./scramble";
import { SETTING_KEYS, SETTING_RULES, withRangeEnd, type AnySettingRule, type RangeEnd, type SettingChoice, type SettingKey, type Settings } from "./settings";
import type { SettingsStore } from "./settingsStore";

export interface ScreenElements {
  overlay: HTMLElement;
  mainMenu: HTMLElement;
  playMenu: HTMLElement;
  settings: HTMLElement;
  settingsTabs: HTMLElement;
  credits: HTMLElement;
  creditsBackButton: HTMLButtonElement;
  host: HTMLElement;
  hostBackButton: HTMLButtonElement;
  guest: HTMLElement;
  guestBackButton: HTMLButtonElement;
  keyHint: HTMLElement;
  canvas: HTMLCanvasElement;
}

interface SettingField {
  read(): unknown;
  write(value: unknown): void;
}

const FOCUS_STEPS: Record<string, FocusStep> = {
  ArrowUp: -1,
  KeyW: -1,
  ArrowDown: 1,
  KeyS: 1,
};

const TAB_STEPS: Record<string, FocusStep> = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};

const SCRAMBLE_DURATION_MS = 200;
const BRACKET_FLASH_KEYFRAMES: Keyframe[] = [{ color: COLOURS.lock }, { color: COLOURS.phosphor }];
const BRACKET_FLASH_OPTIONS: KeyframeAnimationOptions = { duration: 180, pseudoElement: "::before" };

const TITLE_ARC_TRACE_KEYFRAMES: Keyframe[] = [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }];
const TITLE_ARC_TRACE_OPTIONS: KeyframeAnimationOptions = {
  duration: 1400,
  delay: 300,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  fill: "backwards",
};

export function renderMenuItems(menu: HTMLElement, items: readonly MenuItem[]): void {
  const buttons = items.map(menuButton);
  menu.replaceChildren(...buttons);
}

function menuButton(item: MenuItem): HTMLButtonElement {
  const hash = hashFor(item.screen);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = item.label;
  button.addEventListener("click", () => {
    location.hash = hash;
  });
  return button;
}

export function bindMenuFocusKeys(menu: HTMLElement): void {
  menu.addEventListener("keydown", (event) => {
    const step = FOCUS_STEPS[event.code];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const buttons = [...menu.querySelectorAll("button")];
    const focusedIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = moveFocus(focusedIndex, step, buttons.length);
    buttons[nextIndex].focus();
  });
}

export function bindMenuButtonEffects(button: HTMLButtonElement, reducedMotion: MediaQueryList): void {
  const label = button.textContent!;
  button.setAttribute("aria-label", label);
  button.addEventListener("pointerenter", () => {
    button.focus();
  });
  button.addEventListener("focus", () => {
    if (reducedMotion.matches || button.dataset.decoded !== undefined) {
      return;
    }
    button.dataset.decoded = "";
    playScramble(button, label);
  });
  bindBracketFlash(button);
}

export function bindBracketFlash(button: HTMLButtonElement): void {
  button.addEventListener("click", () => {
    button.animate(BRACKET_FLASH_KEYFRAMES, BRACKET_FLASH_OPTIONS);
  });
}

export function bindFullscreenButton(button: HTMLButtonElement, target: Window): void {
  button.hidden = !canEnterFullscreen(target.document);
  button.addEventListener("click", () => {
    void enterLandscapeFullscreen(target.document, target.screen);
  });
}

export function bindFullscreenToggle(button: HTMLButtonElement, target: Window): void {
  const showLabel = () => {
    button.textContent = fullscreenToggleLabel(target.document);
  };
  button.hidden = !canEnterFullscreen(target.document);
  button.addEventListener("click", () => {
    void toggleLandscapeFullscreen(target.document, target.screen);
  });
  target.document.addEventListener("fullscreenchange", showLabel);
  showLabel();
}

function fullscreenToggleLabel(document: Document): string {
  return isFullscreen(document) ? "Exit fullscreen" : "Fullscreen";
}

export function showGestureHint(keyHint: HTMLElement, shown: boolean): void {
  keyHint.toggleAttribute("data-gesture-hint", shown);
}

export function traceTitleArc(arc: SVGPathElement, reducedMotion: MediaQueryList): void {
  if (reducedMotion.matches) {
    return;
  }
  arc.animate(TITLE_ARC_TRACE_KEYFRAMES, TITLE_ARC_TRACE_OPTIONS);
}

function playScramble(button: HTMLButtonElement, label: string): void {
  const startTime = performance.now();
  const showScrambleFrame = (now: number) => {
    const progress = Math.min((now - startTime) / SCRAMBLE_DURATION_MS, 1);
    button.textContent = scrambleLabel(label, progress, Math.random);
    if (progress < 1) {
      requestAnimationFrame(showScrambleFrame);
    }
  };
  requestAnimationFrame(showScrambleFrame);
}

function resetScrambles(overlay: HTMLElement): void {
  const buttons = overlay.querySelectorAll("button");
  for (const button of buttons) {
    delete button.dataset.decoded;
  }
}

export function showScreen(elements: ScreenElements, screen: Screen): void {
  resetScrambles(elements.overlay);
  const matchShown = showsMatch(screen);
  elements.overlay.hidden = matchShown;
  elements.mainMenu.hidden = screen !== "mainMenu";
  elements.playMenu.hidden = screen !== "playMenu";
  elements.settings.hidden = screen !== "settings";
  elements.credits.hidden = screen !== "credits";
  elements.host.hidden = screen !== "host";
  elements.guest.hidden = screen !== "guest";
  elements.keyHint.style.visibility = matchShown ? "visible" : "hidden";
  if (screen === "mainMenu") {
    elements.mainMenu.querySelector("button")!.focus();
  }
  if (screen === "playMenu") {
    elements.playMenu.querySelector("button")!.focus();
  }
  if (screen === "settings") {
    elements.settingsTabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')!.focus();
  }
  if (screen === "credits") {
    elements.creditsBackButton.focus();
  }
  if (screen === "host") {
    elements.hostBackButton.focus();
  }
  if (screen === "guest") {
    elements.guestBackButton.focus();
  }
  if (matchShown) {
    elements.canvas.focus();
  }
}

export function bindSettingsTabs(tabList: HTMLElement): void {
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      selectTab(tabs, tab);
    });
  }
  tabList.addEventListener("keydown", (event) => {
    const step = TAB_STEPS[event.code];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const focusedIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = moveFocus(focusedIndex, step, tabs.length);
    const nextTab = tabs[nextIndex];
    selectTab(tabs, nextTab);
    nextTab.focus();
  });
}

function selectTab(tabs: readonly HTMLButtonElement[], selectedTab: HTMLButtonElement): void {
  for (const tab of tabs) {
    const selected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panelId = tab.getAttribute("aria-controls")!;
    document.getElementById(panelId)!.hidden = !selected;
  }
}

export function bindSettingControls(settingsScreen: HTMLElement, settings: SettingsStore): void {
  for (const key of SETTING_KEYS) {
    const controls = settingControls(settingsScreen, key);
    const field = settingField(settings, key);
    bindSettingControl(controls, SETTING_RULES[key], field);
  }
}

function settingControls(settingsScreen: HTMLElement, key: SettingKey): HTMLElement[] {
  const controls = [...settingsScreen.querySelectorAll<HTMLElement>(`[data-setting="${key}"]`)];
  if (controls.length === 0) {
    throw new Error(`No settings control for "${key}"`);
  }
  return controls;
}

function settingField(settings: SettingsStore, key: SettingKey): SettingField {
  return {
    read: () => settings.current()[key],
    write: (value) => {
      settings.change(key, value as Settings[SettingKey]);
    },
  };
}

function bindSettingControl(controls: readonly HTMLElement[], rule: AnySettingRule, field: SettingField): void {
  switch (rule.control) {
    case "toggle":
      bindToggles(controls as HTMLInputElement[], field);
      break;
    case "choice":
      bindChoiceSelects(controls as HTMLSelectElement[], rule.choices, field);
      break;
    case "range":
      bindRangeSelects(controls as HTMLSelectElement[], rule.choices, field);
      break;
  }
}

function bindToggles(checkboxes: readonly HTMLInputElement[], field: SettingField): void {
  for (const checkbox of checkboxes) {
    checkbox.checked = field.read() === true;
    checkbox.addEventListener("change", () => {
      field.write(checkbox.checked);
    });
  }
}

function bindChoiceSelects(
  selects: readonly HTMLSelectElement[],
  choices: readonly SettingChoice<unknown>[],
  field: SettingField,
): void {
  for (const select of selects) {
    renderChoiceOptions(select, choices);
    showChoice(select, choices, field.read());
    select.addEventListener("change", () => {
      field.write(chosenValue(select, choices));
    });
  }
}

function bindRangeSelects(
  selects: readonly HTMLSelectElement[],
  choices: readonly SettingChoice<number>[],
  field: SettingField,
): void {
  const range = () => field.read() as Readonly<PlanetCountRange>;
  const showRange = () => {
    for (const select of selects) {
      showChoice(select, choices, range()[rangeEndOf(select)]);
    }
  };
  for (const select of selects) {
    renderChoiceOptions(select, choices);
    select.addEventListener("change", () => {
      const updatedRange = withRangeEnd(range(), rangeEndOf(select), chosenValue(select, choices));
      field.write(updatedRange);
      showRange();
    });
  }
  showRange();
}

function rangeEndOf(select: HTMLSelectElement): RangeEnd {
  const end = select.dataset.rangeEnd;
  if (end !== "min" && end !== "max") {
    throw new Error(`Range select has no valid data-range-end: "${end}"`);
  }
  return end;
}

function renderChoiceOptions<T>(select: HTMLSelectElement, choices: readonly SettingChoice<T>[]): void {
  const options = choices.map(choiceOption);
  select.replaceChildren(...options);
}

function choiceOption<T>(choice: SettingChoice<T>): HTMLOptionElement {
  return new Option(choice.label);
}

function showChoice<T>(select: HTMLSelectElement, choices: readonly SettingChoice<T>[], value: T): void {
  select.selectedIndex = choices.findIndex((choice) => choice.value === value);
}

function chosenValue<T>(select: HTMLSelectElement, choices: readonly SettingChoice<T>[]): T {
  return choices[select.selectedIndex].value;
}

export function bindMainMenuButton(button: HTMLButtonElement): void {
  const mainMenuHash = hashFor("mainMenu");
  button.addEventListener("click", () => {
    location.hash = mainMenuHash;
  });
}

export function navigateBack(target: Window, screen: Screen): void {
  const backTarget = backTargetFor(screen);
  if (backTarget !== undefined) {
    navigateTo(target, backTarget);
  }
}

export function navigateTo(target: Window, screen: FixedRouteScreen): void {
  target.location.hash = hashFor(screen);
}

export function bindScreenRoutes(target: Window, enterRoute: (route: Route) => void): void {
  const applyHash = () => {
    const route = resolveHash(target.location.hash);
    if (route.replace) {
      const canonicalHash = hashFor(route.screen);
      target.history.replaceState(null, "", canonicalHash);
    }
    enterRoute(route);
  };
  target.addEventListener("hashchange", applyHash);
  applyHash();
}
