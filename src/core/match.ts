import { createRng, randomInt, type Rng } from "./random";
import { createRoundLayout, type Planet, type Ship, type Side } from "./round";

export type { Aim, Planet, Ship, Side } from "./round";
export { BARREL_DISTANCE } from "./round";

export type Phase = "aiming";

export interface AimDelta {
  angle: number;
  power: number;
}

const MAX_POWER = 350;
const FULL_TURN = 360;

export interface Match {
  rng: Rng;
  phase: Phase;
  activePlayer: Side;
  roundNumber: number;
  roundStepCount: number;
  scores: Record<Side, number>;
  ships: Record<Side, Ship>;
  planets: Planet[];
}

export function createMatch(seed: number): Match {
  const rng = createRng(seed);
  const activePlayer = drawFirstShooter(rng);
  const layout = createRoundLayout(rng);
  return {
    rng,
    phase: "aiming",
    activePlayer,
    roundNumber: 1,
    roundStepCount: 0,
    scores: { left: 0, right: 0 },
    ships: layout.ships,
    planets: layout.planets,
  };
}

function drawFirstShooter(rng: Rng): Side {
  return randomInt(rng, 0, 1) === 0 ? "left" : "right";
}

export function step(match: Match): void {
  match.roundStepCount++;
}

export function adjustAim(match: Match, delta: AimDelta): void {
  if (match.phase !== "aiming") {
    return;
  }
  const aim = match.ships[match.activePlayer].aim;
  aim.angle = (((aim.angle + delta.angle) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  aim.power = Math.min(Math.max(aim.power + delta.power, 0), MAX_POWER);
}

export function phase(match: Match): Phase {
  return match.phase;
}

export function activePlayer(match: Match): Side {
  return match.activePlayer;
}

export function ships(match: Match): Readonly<Record<Side, Readonly<Ship>>> {
  return match.ships;
}

export function planets(match: Match): readonly Readonly<Planet>[] {
  return match.planets;
}

export function roundNumber(match: Match): number {
  return match.roundNumber;
}

export function roundStepCount(match: Match): number {
  return match.roundStepCount;
}

export function scores(match: Match): Readonly<Record<Side, number>> {
  return match.scores;
}
