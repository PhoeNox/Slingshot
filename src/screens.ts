// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { COLOURS } from "./colours";
import { backTargetFor, hashFor, moveFocus, resolveHash, type FocusStep, type MenuItem, type Screen } from "./navigation";
import { scrambleLabel } from "./scramble";
import { SETTING_RULES, withMaxPlanets, withMinPlanets, type SettingChoice, type Settings } from "./settings";

export interface ScreenElements {
  overlay: HTMLElement;
  mainMenu: HTMLElement;
  settings: HTMLElement;
  settingsTabs: HTMLElement;
  contoursCheckbox: HTMLInputElement;
  minPlanetsSelect: HTMLSelectElement;
  maxPlanetsSelect: HTMLSelectElement;
  timeoutSelect: HTMLSelectElement;
  planetVisibilitySelect: HTMLSelectElement;
  bounceCheckbox: HTMLInputElement;
  credits: HTMLElement;
  creditsBackButton: HTMLButtonElement;
  keyHint: HTMLElement;
  canvas: HTMLCanvasElement;
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
  elements.overlay.hidden = screen === "match";
  elements.mainMenu.hidden = screen !== "mainMenu";
  elements.settings.hidden = screen !== "settings";
  elements.credits.hidden = screen !== "credits";
  elements.keyHint.style.visibility = screen === "match" ? "visible" : "hidden";
  if (screen === "mainMenu") {
    elements.mainMenu.querySelector("button")!.focus();
  }
  if (screen === "settings") {
    elements.settingsTabs.querySelector<HTMLButtonElement>('[aria-selected="true"]')!.focus();
  }
  if (screen === "credits") {
    elements.creditsBackButton.focus();
  }
  if (screen === "match") {
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

export function bindContoursCheckbox(
  checkbox: HTMLInputElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  checkbox.checked = settings.gravityWellContours;
  checkbox.addEventListener("change", () => {
    settings.gravityWellContours = checkbox.checked;
    saveSettings(settings);
  });
}

export function bindBounceCheckbox(
  checkbox: HTMLInputElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  checkbox.checked = settings.bounce;
  checkbox.addEventListener("change", () => {
    settings.bounce = checkbox.checked;
    saveSettings(settings);
  });
}

export function bindPlanetCountSelects(
  minSelect: HTMLSelectElement,
  maxSelect: HTMLSelectElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  const choices = SETTING_RULES.planetCount.choices;
  renderChoiceOptions(minSelect, choices);
  renderChoiceOptions(maxSelect, choices);
  const showPlanetCount = () => {
    showChoice(minSelect, choices, settings.planetCount.min);
    showChoice(maxSelect, choices, settings.planetCount.max);
  };
  showPlanetCount();
  minSelect.addEventListener("change", () => {
    settings.planetCount = withMinPlanets(settings.planetCount, chosenValue(minSelect, choices));
    showPlanetCount();
    saveSettings(settings);
  });
  maxSelect.addEventListener("change", () => {
    settings.planetCount = withMaxPlanets(settings.planetCount, chosenValue(maxSelect, choices));
    showPlanetCount();
    saveSettings(settings);
  });
}

export function bindTimeoutSelect(
  select: HTMLSelectElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  const choices = SETTING_RULES.timeoutSeconds.choices;
  renderChoiceOptions(select, choices);
  showChoice(select, choices, settings.timeoutSeconds);
  select.addEventListener("change", () => {
    settings.timeoutSeconds = chosenValue(select, choices);
    saveSettings(settings);
  });
}

export function bindPlanetVisibilitySelect(
  select: HTMLSelectElement,
  settings: Settings,
  saveSettings: (settings: Readonly<Settings>) => void,
): void {
  const choices = SETTING_RULES.planetVisibility.choices;
  renderChoiceOptions(select, choices);
  showChoice(select, choices, settings.planetVisibility);
  select.addEventListener("change", () => {
    settings.planetVisibility = chosenValue(select, choices);
    saveSettings(settings);
  });
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
    target.location.hash = hashFor(backTarget);
  }
}

export function bindScreenRoutes(target: Window, enterScreen: (screen: Screen) => void): void {
  const applyHash = () => {
    const route = resolveHash(target.location.hash);
    if (route.replace) {
      const canonicalHash = hashFor(route.screen);
      target.history.replaceState(null, "", canonicalHash);
    }
    enterScreen(route.screen);
  };
  target.addEventListener("hashchange", applyHash);
  applyHash();
}
