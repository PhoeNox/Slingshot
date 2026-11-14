// SPDX-FileCopyrightText: 2007 Jonathan Musther <jmusther@gmail.com>
// SPDX-FileCopyrightText: 2007 Bart Mak
// SPDX-FileCopyrightText: 2009 Marcus Dreier <m-rei@gmx.net>
// SPDX-FileCopyrightText: 2010 Ryan Kavanagh <ryanakca@kubuntu.org>
// SPDX-FileCopyrightText: 2026 Thomas Eggerling
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterglowSegments, explosionBloom, explosionSize, planetAlpha, roundBanner, trailAlpha } from "./animationCurves";
import { COLOURS } from "./colours";
import type { Missile, Point, Segment } from "./core/flight";
import type { InFlightView, MatchView, RoundOutcome, RoundOverView, RoundResult } from "./core/match";
import { PLAYING_AREA_HEIGHT, PLAYING_AREA_WIDTH } from "./core/playingArea";
import type { Aim, Planet, Ship, Side } from "./core/round";
import { NO_ZOOM, type Zoom } from "./core/zoom";
import { particleAlpha, type Particle, type ParticleSize } from "./debris";
import type {
  BloomItem,
  DotItem,
  FillRectItem,
  FrameItem,
  GroupItem,
  ImageItem,
  LinesItem,
  Rect,
  RingItem,
  SpriteFrameItem,
  SpriteName,
  StrokeRectItem,
  TextItem,
  Transform,
} from "./frameItems";
import type { RemoteNotice } from "./lockstep";

export interface DisplaySettings {
  gravityWellContours: boolean;
}

export type Viewer = { kind: "attract" } | { kind: "hotSeat" } | { kind: "remote"; localSide: Side };

export const ATTRACT_VIEWER: Viewer = { kind: "attract" };
export const HOT_SEAT_VIEWER: Viewer = { kind: "hotSeat" };

interface PresentationStyle {
  zoomed: boolean;
  hud: boolean;
  planetFading: boolean;
  dimmed: boolean;
  triedAims: boolean;
}

interface ShipPose {
  rotation: number;
  frameLeft: number;
  nextFrameLeft: number;
  nextFrameWeight: number;
}

interface BreakdownRow {
  label: string;
  value: string;
  top: number;
}

interface PlayerLabel {
  name: string;
  possessive: string;
}

type PlayerLabels = Record<Side, PlayerLabel>;

interface RoundOverTextTops {
  title: number;
  scoreChange: number;
  prompt: number;
}

const SIDES: readonly Side[] = ["left", "right"];

const HOT_SEAT_LABELS: PlayerLabels = {
  left: { name: "Player 1", possessive: "their" },
  right: { name: "Player 2", possessive: "their" },
};
const LOCAL_PLAYER_LABEL: PlayerLabel = { name: "You", possessive: "your" };
const OPPONENT_LABEL: PlayerLabel = { name: "Opponent", possessive: "their" };
const LOCAL_TURN_TEXT = "Your turn";
const OPPONENT_TURN_TEXT = "Opponent's turn";
const PLAYER_COLOURS: Record<Side, string> = { left: COLOURS.leftPlayer, right: COLOURS.rightPlayer };
const SOLID: number[] = [];
const TRIED_TRAIL_ALPHA = 1;

const SCREEN_CENTRE_X = 399;
const SCREEN_CENTRE_Y = 299;

const SHIP_FRAME_WIDTH = 40;
const SHIP_FRAME_HEIGHT = 33;
const SHIP_FRAME_OFFSET_LEFT = -SHIP_FRAME_WIDTH / 2;
const SHIP_FRAME_OFFSET_TOP = -Math.floor(SHIP_FRAME_HEIGHT / 2);
const SHIP_FRAME_COUNT = 8;
const SHIP_FRAME_ANGLE = 360 / SHIP_FRAME_COUNT;
const SHIP_SHEET_FACING_ANGLE: Record<Side, number> = { left: 90, right: 270 };

const AIM_DASH = [8, 6];
const AIM_TIP_RADIUS = 5;

const BRACKET_LENGTH = 14;

const PLANET_SPRITE_FILL = 0.96;
const GRAVITY_WELL_CONTOUR_COUNT = 3;
const GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS = 1.5;
const GRAVITY_WELL_CONTOUR_ALPHA = 0.45;

const MISSILE_SPRITE_SIZE = 25;

const PARTICLE_SIZES: Record<ParticleSize, number> = { large: 3, small: 1.5 };
const PARTICLE_COLOURS: Record<ParticleSize, string> = { large: COLOURS.lock, small: COLOURS.phosphor };

const HUD_FONT_SIZE = 14;
const HUD_TOP = 5;
const ANGLE_INFO_LEFT = 290;
const POWER_INFO_LEFT = 403;
const TIMEOUT_INFO_BOTTOM = 594;
const LEFT_SCORE_LEFT = 5;
const RIGHT_SCORE_RIGHT = 794;

const GLASS_COLOUR = "rgba(4, 8, 21, 0.78)";
const PANEL_OUTLINE_GAP = 4;
const PANEL_TITLE_FONT_SIZE = 16;

const MESSAGE_WIDTH = 450;
const MESSAGE_BASE_HEIGHT = 190;
const MESSAGE_HIT_EXTRA_HEIGHT = 40;
const MESSAGE_TEXT_CENTRE_X = 224;
const MESSAGE_LABEL_LEFT = 50;
const MESSAGE_VALUE_RIGHT = 399;
const MESSAGE_TITLE_TOP = 28;
const MESSAGE_FIRST_ROW_TOP = 65;
const MESSAGE_ROW_HEIGHT = 20;
const MESSAGE_SCORE_CHANGE_TOP = 100;
const MESSAGE_PROMPT_TOP = 140;
const MESSAGE_PROMPT_TEXT = "Press Space or Enter for the next round";
const MESSAGE_WAITING_TEXT = "Waiting for opponent to start the next round";

const NOTICE_HEIGHT = 110;
const NOTICE_DETAIL_TOP = 65;
const NOTICE_TITLES: Record<RemoteNotice, string> = {
  awaitingHost: "Waiting for the host…",
  opponentLeft: "Opponent left",
  outOfSync: "Out of sync",
  versionMismatch: "Different game version, reload both",
};
const NOTICE_DETAILS: Record<RemoteNotice, string> = {
  awaitingHost: "",
  opponentLeft: "Returning to the main menu",
  outOfSync: "Returning to the main menu",
  versionMismatch: "Returning to the main menu",
};

const ZOOM_OUTLINE_ALPHA = 0.5;

const ATTRACT_DIM_COLOUR = "rgba(4, 8, 21, 0.55)";

const PLAYING_AREA: Readonly<Rect> = { left: 0, top: 0, width: PLAYING_AREA_WIDTH, height: PLAYING_AREA_HEIGHT };

const MATCH_STYLE: Readonly<PresentationStyle> = {
  zoomed: true,
  hud: true,
  planetFading: true,
  dimmed: false,
  triedAims: true,
};
const ATTRACT_STYLE: Readonly<PresentationStyle> = {
  zoomed: false,
  hud: false,
  planetFading: false,
  dimmed: true,
  triedAims: false,
};

const VIEWER_STYLES: Record<Viewer["kind"], Readonly<PresentationStyle>> = {
  attract: ATTRACT_STYLE,
  hotSeat: MATCH_STYLE,
  remote: MATCH_STYLE,
};

export function describeFrame(
  view: MatchView,
  display: Readonly<DisplaySettings>,
  debris: readonly Readonly<Particle>[],
  viewer: Readonly<Viewer>,
): FrameItem[] {
  const style = VIEWER_STYLES[viewer.kind];
  const scene = sceneItems(view, display, debris, style);
  const hud = style.hud ? hudItems(view, localSideOf(viewer)) : [];
  return [...scene, ...hud];
}

function localSideOf(viewer: Readonly<Viewer>): Side | undefined {
  return viewer.kind === "remote" ? viewer.localSide : undefined;
}

function hudItems(view: MatchView, localSide: Side | undefined): FrameItem[] {
  const labels = playerLabels(localSide);
  const border = bounceBorderItems(view.rules.bounce);
  const readouts = phaseReadoutItems(view);
  const turn = turnItems(view, localSide);
  const message = roundOverMessageItems(view.phase, labels, localSide);
  const scores = scoreItems(view.scores, labels);
  const banner = roundBannerItems(view.roundNumber, view.roundStepCount);
  return [...border, ...readouts, ...turn, ...message, ...scores, ...banner];
}

function playerLabels(localSide: Side | undefined): PlayerLabels {
  if (localSide === undefined) {
    return HOT_SEAT_LABELS;
  }
  return localSide === "left"
    ? { left: LOCAL_PLAYER_LABEL, right: OPPONENT_LABEL }
    : { left: OPPONENT_LABEL, right: LOCAL_PLAYER_LABEL };
}

function turnItems(view: MatchView, localSide: Side | undefined): TextItem[] {
  if (localSide === undefined || view.phase.kind !== "aiming") {
    return [];
  }
  const text = view.activePlayer === localSide ? LOCAL_TURN_TEXT : OPPONENT_TURN_TEXT;
  const colour = PLAYER_COLOURS[view.activePlayer];
  return [hudText(text, colour, SCREEN_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom")];
}

export function describeRemoteNotice(notice: RemoteNotice): FrameItem[] {
  const box = noticeBox();
  const panel = roundOverPanelItems(box);
  const title = panelTitleItem(NOTICE_TITLES[notice], MESSAGE_TITLE_TOP);
  const detail = hudText(NOTICE_DETAILS[notice], COLOURS.instrumentDim, MESSAGE_TEXT_CENTRE_X, NOTICE_DETAIL_TOP, "center", "top");
  return [
    ...panel,
    {
      kind: "group",
      transform: { x: box.left, y: box.top, rotation: 0, scale: 1 },
      items: [title, detail],
    },
  ];
}

function noticeBox(): Rect {
  return {
    left: SCREEN_CENTRE_X - MESSAGE_WIDTH / 2,
    top: SCREEN_CENTRE_Y - Math.floor(NOTICE_HEIGHT / 2),
    width: MESSAGE_WIDTH,
    height: NOTICE_HEIGHT,
  };
}

function bounceBorderItems(bounce: boolean): StrokeRectItem[] {
  if (!bounce) {
    return [];
  }
  const outline = strokeOutline(PLAYING_AREA);
  return [{ kind: "strokeRect", colour: COLOURS.instrumentDim, rect: outline }];
}

function sceneItems(
  view: MatchView,
  display: Readonly<DisplaySettings>,
  debris: readonly Readonly<Particle>[],
  style: Readonly<PresentationStyle>,
): FrameItem[] {
  const zoom = style.zoomed ? view.zoom : NO_ZOOM;
  const alpha = style.planetFading ? matchPlanetAlpha(view) : 1;
  const planets = planetItems(view.planets, display, alpha);
  const triedShotNumbers = style.triedAims ? triedShotNumbersOf(view) : new Set<number>();
  const trails = trailItems(view.trails, triedShotNumbers);
  const particles = debrisItems(debris, 1 / zoom.scale);
  const phase = phaseSceneItems(view, zoom, style.hud);
  const zoomedScene = zoomedSceneItems([...planets, ...trails, ...particles, ...phase], zoom);
  const dimming = dimmingItems(style.dimmed);
  return [...zoomedScene, ...dimming];
}

function matchPlanetAlpha(view: MatchView): number {
  const stepsSinceRoundOver = view.phase.kind === "roundOver" ? view.phase.stepsSinceRoundOver : undefined;
  return planetAlpha(view.rules.planetVisibility, view.roundStepCount, stepsSinceRoundOver);
}

function dimmingItems(dimmed: boolean): FillRectItem[] {
  if (!dimmed) {
    return [];
  }
  return [{ kind: "fillRect", colour: ATTRACT_DIM_COLOUR, rect: PLAYING_AREA }];
}

function debrisItems(debris: readonly Readonly<Particle>[], sizeScale: number): DotItem[] {
  return debris.map((particle) => ({
    kind: "dot",
    colour: PARTICLE_COLOURS[particle.size],
    centre: { x: particle.x, y: particle.y },
    size: PARTICLE_SIZES[particle.size] * sizeScale,
    alpha: particleAlpha(particle),
  }));
}

function zoomedSceneItems(scene: FrameItem[], zoom: Readonly<Zoom>): FrameItem[] {
  if (zoom.scale === 1) {
    return scene;
  }
  const transform = zoomTransform(zoom);
  const outline = playingAreaOutlineItem(transform);
  const zoomGroup: GroupItem = { kind: "group", transform, items: scene };
  return [outline, zoomGroup];
}

function zoomTransform(zoom: Readonly<Zoom>): Transform {
  return { x: 0 - zoom.left * zoom.scale, y: 0 - zoom.top * zoom.scale, rotation: 0, scale: zoom.scale };
}

function playingAreaOutlineItem(transform: Readonly<Transform>): LinesItem {
  const zoomedArea = {
    left: transform.x,
    top: transform.y,
    width: PLAYING_AREA_WIDTH * transform.scale,
    height: PLAYING_AREA_HEIGHT * transform.scale,
  };
  const outline = strokeOutline(zoomedArea);
  const segments = rectSegments(outline);
  return {
    kind: "lines",
    colour: COLOURS.instrumentDim,
    segments,
    alpha: ZOOM_OUTLINE_ALPHA,
    dash: SOLID,
    glow: false,
  };
}

export function describeBackdropFrame(): FrameItem[] {
  const backdrop = imageItem("backdrop", PLAYING_AREA, 1);
  return [backdrop];
}

function phaseSceneItems(view: MatchView, zoom: Readonly<Zoom>, aimReticle: boolean): FrameItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return aimingSceneItems(view, aimReticle);
    case "inFlight":
      return flightSceneItems(view, view.phase, MISSILE_SPRITE_SIZE / zoom.scale);
    case "roundOver":
      return hitSceneItems(view.ships, view.phase);
  }
}

function phaseReadoutItems(view: MatchView): TextItem[] {
  switch (view.phase.kind) {
    case "aiming":
      return aimInfoItems(view.ships[view.activePlayer].aim);
    case "inFlight":
      return flightHudItems(view.powerPenalty, view.phase);
    case "roundOver":
      return [];
  }
}

function imageItem(sprite: SpriteName, target: Readonly<Rect>, alpha: number): ImageItem {
  return { kind: "image", sprite, target, alpha };
}

function hudText(
  text: string,
  colour: string,
  x: number,
  y: number,
  align: TextItem["align"],
  baseline: TextItem["baseline"],
): TextItem {
  return { kind: "text", text, x, y, colour, font: "text", fontSize: HUD_FONT_SIZE, align, baseline, alpha: 1 };
}

function glowLinesItem(colour: string, segments: Segment[], alpha: number, dash: number[]): LinesItem {
  return { kind: "lines", colour, segments, alpha, dash, glow: true };
}

function bracketItem(rect: Readonly<Rect>): LinesItem {
  const brackets = cornerBrackets(rect, BRACKET_LENGTH);
  return glowLinesItem(COLOURS.phosphor, brackets, 1, SOLID);
}

function planetItems(
  roundPlanets: MatchView["planets"],
  display: Readonly<DisplaySettings>,
  alpha: number,
): FrameItem[] {
  if (alpha === 0) {
    return [];
  }
  const contours = display.gravityWellContours
    ? roundPlanets.flatMap((planet) => gravityWellContourItems(planet, alpha))
    : [];
  const sprites = roundPlanets.map((planet) => planetSpriteItem(planet, alpha));
  return [...contours, ...sprites];
}

function gravityWellContourItems(planet: Readonly<Planet>, alpha: number): RingItem[] {
  const radii = gravityWellContourRadii(planet);
  return radii.map((radius) => ({
    kind: "ring",
    colour: COLOURS.instrumentDim,
    centre: { x: planet.x, y: planet.y },
    radius,
    alpha: GRAVITY_WELL_CONTOUR_ALPHA * alpha,
  }));
}

function planetSpriteItem(planet: Readonly<Planet>, alpha: number): ImageItem {
  const sprite: SpriteName = `planet${planet.sprite}`;
  const box = planetBox(planet);
  return imageItem(sprite, box, alpha);
}

function triedShotNumbersOf(view: MatchView): Set<number> {
  if (view.phase.kind !== "aiming") {
    return new Set();
  }
  const aim = view.ships[view.activePlayer].aim;
  const tried = view.firedShots.filter((shot) => shot.shooter === view.activePlayer && isSameAim(shot.aim, aim));
  return new Set(tried.map((shot) => shot.shotNumber));
}

function isSameAim(fired: Readonly<Aim>, current: Readonly<Aim>): boolean {
  return fired.angle === current.angle && fired.power === current.power;
}

function trailItems(roundTrails: MatchView["trails"], triedShotNumbers: ReadonlySet<number>): LinesItem[] {
  const latestShotNumber = roundTrails.at(-1)?.shotNumber ?? 0;
  const shotNumbers = new Set(roundTrails.map((segment) => segment.shotNumber));
  return [...shotNumbers].map((shotNumber) => {
    const segments = roundTrails.filter((segment) => segment.shotNumber === shotNumber);
    const tried = triedShotNumbers.has(shotNumber);
    const alpha = tried ? TRIED_TRAIL_ALPHA : trailAlpha(latestShotNumber - shotNumber);
    return {
      kind: "lines",
      colour: PLAYER_COLOURS[segments[0].shooter],
      segments,
      alpha,
      dash: SOLID,
      glow: tried,
    };
  });
}

function shipItems(roundShips: MatchView["ships"], sides: readonly Side[]): GroupItem[] {
  return sides.map((side) => shipItem(side, roundShips[side]));
}

function shipItem(side: Side, ship: Readonly<Ship>): GroupItem {
  const pose = shipPose(ship.aim.angle, side);
  const frame = shipFrameItem(side, pose.frameLeft, 1);
  const nextFrame = shipFrameItem(side, pose.nextFrameLeft, pose.nextFrameWeight);
  return {
    kind: "group",
    transform: { x: ship.x, y: ship.y, rotation: pose.rotation, scale: 1 },
    items: [frame, nextFrame],
  };
}

function shipFrameItem(side: Side, frameLeft: number, alpha: number): SpriteFrameItem {
  const sprite: SpriteName = `${side}Ship`;
  return {
    kind: "spriteFrame",
    sprite,
    source: { left: frameLeft, top: 0, width: SHIP_FRAME_WIDTH, height: SHIP_FRAME_HEIGHT },
    target: {
      left: SHIP_FRAME_OFFSET_LEFT,
      top: SHIP_FRAME_OFFSET_TOP,
      width: SHIP_FRAME_WIDTH,
      height: SHIP_FRAME_HEIGHT,
    },
    alpha,
  };
}

function aimingSceneItems(view: MatchView, aimReticle: boolean): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const reticle = aimReticle ? aimReticleItems(view.aimLine, PLAYER_COLOURS[view.activePlayer]) : [];
  return [...ships, ...reticle];
}

function aimReticleItems(line: Readonly<Segment>, colour: string): FrameItem[] {
  const dashedLine = glowLinesItem(colour, [line], 1, AIM_DASH);
  const tip: RingItem = { kind: "ring", colour, centre: line.to, radius: AIM_TIP_RADIUS, alpha: 1 };
  return [dashedLine, tip];
}

function aimInfoItems(aim: Readonly<Aim>): TextItem[] {
  const angleText = angleInfoText(aim);
  const powerText = powerInfoText(aim);
  return [
    hudText(angleText, COLOURS.phosphor, ANGLE_INFO_LEFT, HUD_TOP, "left", "top"),
    hudText(powerText, COLOURS.phosphor, POWER_INFO_LEFT, HUD_TOP, "left", "top"),
  ];
}

function flightSceneItems(view: MatchView, flight: InFlightView, missileSize: number): FrameItem[] {
  const ships = shipItems(view.ships, SIDES);
  const afterglow = afterglowItems(view.trails, flight);
  const missile = missileItem(flight.missile, missileSize);
  return [...ships, ...afterglow, missile];
}

function flightHudItems(powerPenalty: number, flight: InFlightView): TextItem[] {
  const penaltyText = powerPenaltyText(powerPenalty);
  const timeout = timeoutItems(flight);
  return [hudText(penaltyText, COLOURS.instrumentDim, SCREEN_CENTRE_X, HUD_TOP, "center", "top"), ...timeout];
}

function timeoutItems(flight: InFlightView): TextItem[] {
  const stepsLeft = flight.missile.flightStepsLeft;
  if (stepsLeft === undefined) {
    return [];
  }
  const text = timeoutText(stepsLeft, flight.timedOut);
  return [hudText(text, COLOURS.instrumentDim, SCREEN_CENTRE_X, TIMEOUT_INFO_BOTTOM, "center", "bottom")];
}

function afterglowItems(roundTrails: MatchView["trails"], flight: InFlightView): LinesItem[] {
  const fading = afterglowSegments(roundTrails, flight.stepsFlown);
  return fading.map(({ segment, alpha }) => glowLinesItem(PLAYER_COLOURS[segment.shooter], [segment], alpha, SOLID));
}

function missileItem(flyingMissile: Readonly<Missile>, size: number): ImageItem {
  const box = centredBox(flyingMissile, size, size);
  return imageItem("missile", box, 1);
}

function scoreItems(matchScores: MatchView["scores"], labels: Readonly<PlayerLabels>): TextItem[] {
  const texts = scoreTexts(matchScores, labels);
  return [
    hudText(texts.left, PLAYER_COLOURS.left, LEFT_SCORE_LEFT, HUD_TOP, "left", "top"),
    hudText(texts.right, PLAYER_COLOURS.right, RIGHT_SCORE_RIGHT, HUD_TOP, "right", "top"),
  ];
}

function roundBannerItems(round: number, stepsIntoRound: number): TextItem[] {
  const banner = roundBanner(round, stepsIntoRound);
  if (banner === null) {
    return [];
  }
  return [
    {
      kind: "text",
      text: banner.text,
      x: SCREEN_CENTRE_X,
      y: SCREEN_CENTRE_Y,
      colour: COLOURS.phosphor,
      font: "title",
      fontSize: banner.fontSize,
      align: "center",
      baseline: "middle",
      alpha: banner.alpha,
    },
  ];
}

function hitSceneItems(roundShips: MatchView["ships"], roundOver: RoundOverView): FrameItem[] {
  const hitSide = roundOver.result.hitShip;
  const survivingSides = SIDES.filter((side) => side !== hitSide);
  const ships = shipItems(roundShips, survivingSides);
  const hitShip = roundShips[hitSide];
  const explosion = explosionItems(hitShip, roundOver.stepsSinceRoundOver);
  const bloom = bloomItems(hitShip, roundOver.stepsSinceRoundOver);
  return [...ships, ...explosion, ...bloom];
}

function explosionItems(ship: Readonly<Ship>, stepsSinceHit: number): ImageItem[] {
  const size = explosionSize(stepsSinceHit);
  if (size === null) {
    return [];
  }
  const box = centredBox(ship, size, size);
  return [imageItem("explosion", box, 1)];
}

function bloomItems(ship: Readonly<Ship>, stepsSinceHit: number): BloomItem[] {
  const bloom = explosionBloom(stepsSinceHit);
  if (bloom === null) {
    return [];
  }
  return [
    {
      kind: "bloom",
      colour: COLOURS.phosphor,
      centre: { x: ship.x, y: ship.y },
      radius: bloom.radius,
      alpha: bloom.alpha,
    },
  ];
}

function roundOverMessageItems(
  phase: MatchView["phase"],
  labels: Readonly<PlayerLabels>,
  localSide: Side | undefined,
): FrameItem[] {
  if (phase.kind !== "roundOver") {
    return [];
  }
  const prompt = roundOverPrompt(phase.nextShooter, localSide);
  return roundResultMessageItems(phase.result, labels, prompt);
}

function roundOverPrompt(nextShooter: Side, localSide: Side | undefined): string {
  return localSide === undefined || localSide === nextShooter ? MESSAGE_PROMPT_TEXT : MESSAGE_WAITING_TEXT;
}

function roundResultMessageItems(
  result: Readonly<RoundResult>,
  labels: Readonly<PlayerLabels>,
  prompt: string,
): FrameItem[] {
  const box = roundOverMessageBox(result.outcome);
  const panel = roundOverPanelItems(box);
  const tops = roundOverTextTops(result.outcome);
  const titleText = roundOverTitle(result, labels);
  const title = panelTitleItem(titleText, tops.title);
  const scoreChange = scoreChangeText(result.scoreChange);
  const rows = scoreBreakdownRows(result);
  const rowTexts = rows.flatMap((row) => [
    hudText(row.label, COLOURS.instrumentDim, MESSAGE_LABEL_LEFT, row.top, "left", "top"),
    hudText(row.value, COLOURS.phosphor, MESSAGE_VALUE_RIGHT, row.top, "right", "top"),
  ]);
  const shooterColour = PLAYER_COLOURS[result.shooter];
  return [
    ...panel,
    {
      kind: "group",
      transform: { x: box.left, y: box.top, rotation: 0, scale: 1 },
      items: [
        title,
        hudText(scoreChange, shooterColour, MESSAGE_TEXT_CENTRE_X, tops.scoreChange, "center", "top"),
        hudText(prompt, COLOURS.instrumentDim, MESSAGE_TEXT_CENTRE_X, tops.prompt, "center", "top"),
        ...rowTexts,
      ],
    },
  ];
}

function roundOverPanelItems(box: Readonly<Rect>): FrameItem[] {
  const outerOutline = strokeOutline(box);
  const innerBox = insetRect(box, PANEL_OUTLINE_GAP);
  const innerOutline = strokeOutline(innerBox);
  const brackets = bracketItem(outerOutline);
  return [
    { kind: "fillRect", colour: GLASS_COLOUR, rect: box },
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: outerOutline },
    { kind: "strokeRect", colour: COLOURS.instrumentDim, rect: innerOutline },
    brackets,
  ];
}

function panelTitleItem(text: string, top: number): TextItem {
  return {
    kind: "text",
    text,
    x: MESSAGE_TEXT_CENTRE_X,
    y: top,
    colour: COLOURS.phosphor,
    font: "title",
    fontSize: PANEL_TITLE_FONT_SIZE,
    align: "center",
    baseline: "top",
    alpha: 1,
  };
}

function shipPose(aimAngle: number, side: Side): ShipPose {
  const rotationDegrees = (aimAngle - SHIP_SHEET_FACING_ANGLE[side] + 360) % 360;
  const frame = Math.floor(rotationDegrees / SHIP_FRAME_ANGLE);
  const nextFrame = (frame + 1) % SHIP_FRAME_COUNT;
  return {
    rotation: (rotationDegrees * Math.PI) / 180,
    frameLeft: frame * SHIP_FRAME_WIDTH,
    nextFrameLeft: nextFrame * SHIP_FRAME_WIDTH,
    nextFrameWeight: (rotationDegrees - frame * SHIP_FRAME_ANGLE) / SHIP_FRAME_ANGLE,
  };
}

function gravityWellContourRadii(planet: Readonly<Planet>): number[] {
  const spacing = Math.sqrt(planet.mass) * GRAVITY_WELL_CONTOUR_SPACING_PER_SQRT_MASS;
  return Array.from({ length: GRAVITY_WELL_CONTOUR_COUNT }, (_, index) => planet.radius + (index + 1) * spacing);
}

function planetBox(planet: Readonly<Planet>): Rect {
  const size = Math.round((2 * planet.radius) / PLANET_SPRITE_FILL);
  return {
    left: planet.x - Math.floor(size / 2),
    top: planet.y - Math.floor(size / 2),
    width: size,
    height: size,
  };
}

function centredBox(centre: Readonly<Point>, width: number, height: number): Rect {
  return { left: centre.x - width / 2, top: centre.y - height / 2, width, height };
}

function strokeOutline(rect: Readonly<Rect>): Rect {
  return { left: rect.left + 0.5, top: rect.top + 0.5, width: rect.width - 1, height: rect.height - 1 };
}

function insetRect(rect: Readonly<Rect>, inset: number): Rect {
  return {
    left: rect.left + inset,
    top: rect.top + inset,
    width: rect.width - 2 * inset,
    height: rect.height - 2 * inset,
  };
}

function cornerBrackets(rect: Readonly<Rect>, length: number): Segment[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const corners = [
    { x: rect.left, y: rect.top, dx: 1, dy: 1 },
    { x: right, y: rect.top, dx: -1, dy: 1 },
    { x: rect.left, y: bottom, dx: 1, dy: -1 },
    { x: right, y: bottom, dx: -1, dy: -1 },
  ];
  return corners.flatMap(({ x, y, dx, dy }) => [
    { from: { x, y }, to: { x: x + dx * length, y } },
    { from: { x, y }, to: { x, y: y + dy * length } },
  ]);
}

function rectSegments(rect: Readonly<Rect>): Segment[] {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: right, y: rect.top },
    { x: right, y: bottom },
    { x: rect.left, y: bottom },
  ];
  return corners.map((corner, index) => ({ from: corner, to: corners[(index + 1) % corners.length] }));
}

function angleInfoText(aim: Readonly<Aim>): string {
  return `Angle: ${aim.angle.toFixed(2)}`;
}

function powerInfoText(aim: Readonly<Aim>): string {
  return `Power: ${aim.power.toFixed(1)}`;
}

function powerPenaltyText(penalty: number): string {
  return `Power penalty: ${Math.trunc(penalty)}`;
}

function timeoutText(flightStepsLeft: number, timedOut: boolean): string {
  return timedOut ? "Shot timed out..." : `Timeout in ${flightStepsLeft}`;
}

function scoreTexts(scores: Readonly<Record<Side, number>>, labels: Readonly<PlayerLabels>): Record<Side, string> {
  return {
    left: `${labels.left.name}  --  ${scores.left}`,
    right: `${scores.right}  --  ${labels.right.name}`,
  };
}

function roundOverMessageBox(outcome: RoundOutcome): Rect {
  const height = MESSAGE_BASE_HEIGHT + (outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0);
  return {
    left: SCREEN_CENTRE_X - MESSAGE_WIDTH / 2,
    top: SCREEN_CENTRE_Y - Math.floor(height / 2),
    width: MESSAGE_WIDTH,
    height,
  };
}

function roundOverTextTops(outcome: RoundOutcome): RoundOverTextTops {
  const rowsOffset = outcome === "hit" ? MESSAGE_HIT_EXTRA_HEIGHT : 0;
  return {
    title: MESSAGE_TITLE_TOP,
    scoreChange: MESSAGE_SCORE_CHANGE_TOP + rowsOffset,
    prompt: MESSAGE_PROMPT_TOP + rowsOffset,
  };
}

function roundOverTitle(result: Readonly<RoundResult>, labels: Readonly<PlayerLabels>): string {
  const shooter = labels[result.shooter];
  return result.outcome === "hit"
    ? `${shooter.name} hit ${labels[result.hitShip].name.toLowerCase()}`
    : `${shooter.name} hit ${shooter.possessive} own ship`;
}

function scoreBreakdownRows(result: Readonly<RoundResult>): BreakdownRow[] {
  const entries: [string, number][] = result.outcome === "selfHit"
    ? [["Hit self:", result.baseScore]]
    : [
        ["Hit opponent:", result.baseScore],
        ["Quick-hit bonus:", result.quickHitBonus],
        ["Power penalty:", -result.powerPenalty],
      ];
  return entries.map(([label, value], index) => ({
    label,
    value: `${value}`,
    top: MESSAGE_FIRST_ROW_TOP + index * MESSAGE_ROW_HEIGHT,
  }));
}

function scoreChangeText(scoreChange: number): string {
  return scoreChange >= 0 ? `${scoreChange} added to score` : `${-scoreChange} deducted from score`;
}
