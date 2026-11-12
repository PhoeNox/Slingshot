const STEP_DURATION_MS = 1000 / 30;
const MAX_FRAME_GAP_MS = 250;

interface StepClock {
  previousTime: number | undefined;
  pendingTime: number;
}

export function startGameLoop(stepSimulation: () => void, render: () => void): void {
  const clock: StepClock = { previousTime: undefined, pendingTime: 0 };
  const onAnimationFrame = (time: number) => {
    const dueSteps = takeDueSteps(clock, time);
    for (let i = 0; i < dueSteps; i++) {
      stepSimulation();
    }
    render();
    requestAnimationFrame(onAnimationFrame);
  };
  requestAnimationFrame(onAnimationFrame);
}

function takeDueSteps(clock: StepClock, time: number): number {
  const elapsed = clock.previousTime === undefined ? 0 : Math.min(time - clock.previousTime, MAX_FRAME_GAP_MS);
  clock.previousTime = time;
  clock.pendingTime += elapsed;
  const dueSteps = Math.floor(clock.pendingTime / STEP_DURATION_MS);
  clock.pendingTime -= dueSteps * STEP_DURATION_MS;
  return dueSteps;
}
