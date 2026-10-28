import type { PlinkoOutcome } from "./plinko";

export const PLINKO_POCKETS: PlinkoOutcome[] = ["free_meal", "replay", "tok_one_month", "lost", "half_price"];

// Presentation only: the server draw owns the reward. We choose initial conditions
// whose unsteered physical simulation lands in that reward's pocket.
export const PLINKO_GEOMETRY = {
  width: 500, height: 350, left: 24, right: 476, floor: 345,
  ballRadius: 13, pegRadius: 3.8, dividerTop: 292, dividerRadius: 2,
} as const;

export const PLINKO_PEGS = Array.from({ length: 8 }, (_, row) =>
  Array.from({ length: row + 3 }, (_, column) => ({
    x: 250 + (column - (row + 2) / 2) * 40,
    y: 61 + row * 29,
  }))).flat();
export const PLINKO_DIVIDERS = [100, 200, 300, 400];
export const PLINKO_STEP = 1 / 240;
const GRAVITY = 820;
const MAX_STEPS = 240 * 8;

export type PlinkoLaunch = { x: number; vx: number; vy: number };
export type PlinkoFrame = { x: number; y: number; angle: number; vx: number; vy: number };
export type PlinkoImpact = { time: number; peg: number };
export type PlinkoTrajectory = {
  frames: PlinkoFrame[];
  impacts: PlinkoImpact[];
  pocket: number;
  duration: number;
  launch: PlinkoLaunch;
};

/** Fixed timestep circle/circle and circle/capsule collisions, in SVG units. */
export function simulatePlinko(launch: PlinkoLaunch): PlinkoTrajectory | null {
  const g = PLINKO_GEOMETRY;
  if (![launch.x, launch.vx, launch.vy].every(Number.isFinite)
    || launch.x < g.left + g.ballRadius || launch.x > g.right - g.ballRadius
    || Math.abs(launch.vx) > 200 || launch.vy < 0 || launch.vy > 50) return null;
  const ball = { x: launch.x, y: 18, vx: launch.vx, vy: launch.vy, angle: 0 };
  let spin = launch.vx / g.ballRadius;
  const frames: PlinkoFrame[] = [{ ...ball }];
  const impacts: PlinkoImpact[] = [];
  let settledTicks = 0;

  const collide = (x: number, y: number, radius: number, restitution: number) => {
    const dx = ball.x - x;
    const dy = ball.y - y;
    const separation = g.ballRadius + radius;
    if (Math.abs(dx) >= separation || Math.abs(dy) >= separation) return false;
    const distance = Math.hypot(dx, dy);
    if (distance >= separation) return false;
    const nx = distance > 1e-9 ? dx / distance : 0;
    const ny = distance > 1e-9 ? dy / distance : -1;
    ball.x = x + nx * separation;
    ball.y = y + ny * separation;
    const normalSpeed = ball.vx * nx + ball.vy * ny;
    if (normalSpeed >= 0) return false;
    ball.vx -= (1 + restitution) * normalSpeed * nx;
    ball.vy -= (1 + restitution) * normalSpeed * ny;
    // Tangential friction transfers a little of the impact into visible spin.
    const tangentSpeed = -ball.vx * ny + ball.vy * nx;
    ball.vx += tangentSpeed * ny * 0.035;
    ball.vy -= tangentSpeed * nx * 0.035;
    spin = spin * 0.7 + tangentSpeed / g.ballRadius * 0.3;
    return normalSpeed < -25;
  };

  for (let tick = 1; tick <= MAX_STEPS; tick++) {
    ball.vy += GRAVITY * PLINKO_STEP;
    ball.vx *= 0.9996;
    ball.x += ball.vx * PLINKO_STEP;
    ball.y += ball.vy * PLINKO_STEP;
    ball.angle += spin * PLINKO_STEP * 180 / Math.PI;

    // Two contact passes resolve simultaneous contacts without tunnelling.
    for (let pass = 0; pass < 2; pass++) {
      for (let peg = 0; peg < PLINKO_PEGS.length; peg++) {
        const pin = PLINKO_PEGS[peg];
        if (collide(pin.x, pin.y, g.pegRadius, 0.72) && pass === 0) {
          impacts.push({ time: tick * PLINKO_STEP, peg });
        }
      }
      for (const x of PLINKO_DIVIDERS) {
        collide(x, Math.max(g.dividerTop, Math.min(g.floor, ball.y)), g.dividerRadius, 0.55);
      }
      if (ball.x < g.left + g.ballRadius) {
        ball.x = g.left + g.ballRadius;
        ball.vx = Math.abs(ball.vx) * 0.65;
      } else if (ball.x > g.right - g.ballRadius) {
        ball.x = g.right - g.ballRadius;
        ball.vx = -Math.abs(ball.vx) * 0.65;
      }
      if (ball.y < g.ballRadius) {
        ball.y = g.ballRadius;
        ball.vy = Math.abs(ball.vy) * 0.5;
      }
      if (ball.y > g.floor - g.ballRadius) {
        ball.y = g.floor - g.ballRadius;
        ball.vy = Math.abs(ball.vy) < 18 ? 0 : -Math.abs(ball.vy) * 0.36;
        ball.vx *= 0.84;
        spin *= 0.8;
      }
    }
    frames.push({ ...ball });
    settledTicks = ball.y >= g.floor - g.ballRadius - 0.01
      && Math.hypot(ball.vx, ball.vy) < 3 ? settledTicks + 1 : 0;
    if (settledTicks >= 24) {
      return { frames, impacts, pocket: Math.min(4, Math.floor(ball.x / 100)),
        duration: tick * PLINKO_STEP, launch: { ...launch } };
    }
  }
  return null; // A stalled candidate is discarded, never nudged towards a prize.
}

// Known-good initial conditions, verified through the same integrator. They
// bound search time even if an RNG repeatedly produces a stalled candidate.
const FALLBACK_LAUNCHES: PlinkoLaunch[][] = [
  [{ x: 211.632214859128, vx: -154.7046885639429, vy: 13.578894862439483 }, { x: 234.92500964552164, vx: -157.73740105330944, vy: 11.566679016686976 }],
  [{ x: 272.67603328451514, vx: -147.24661841988564, vy: 18.595030560391024 }, { x: 246.8235339410603, vx: -33.12527507543564, vy: 23.9880321722012 }],
  [{ x: 242.49002408236265, vx: 144.884530082345, vy: 24.84195833094418 }, { x: 267.0121248997748, vx: 24.336941838264465, vy: 19.03555378667079 }],
  [{ x: 247.81044255942106, vx: 23.146632686257362, vy: 5.024519050493836 }, { x: 284.7528114914894, vx: -70.26676304638386, vy: 7.170466345269233 }],
  [{ x: 260.7923244871199, vx: 131.20944440364838, vy: 2.811541728442535 }, { x: 222.89995370432734, vx: 137.30053320527077, vy: 19.185566768283024 }],
];

export function createPlinkoTrajectory(pocket: number, random: () => number = Math.random): PlinkoTrajectory {
  if (!Number.isInteger(pocket) || pocket < 0 || pocket > 4) throw new RangeError("Invalid Plinko pocket");
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = simulatePlinko({ x: 210 + random() * 80, vx: (random() - 0.5) * 320, vy: random() * 25 });
    if (candidate?.pocket === pocket && candidate.impacts.length >= 4 && candidate.duration <= 5.5) return candidate;
  }
  const fallback = simulatePlinko(FALLBACK_LAUNCHES[pocket][random() < 0.5 ? 0 : 1]);
  if (!fallback || fallback.pocket !== pocket) throw new Error("No physical Plinko trajectory");
  return fallback;
}

/** Render interpolation only; neither display refresh rate nor a hidden tab changes physics. */
export function samplePlinkoTrajectory(trajectory: PlinkoTrajectory, seconds: number): PlinkoFrame {
  const position = Math.max(0, Math.min(trajectory.frames.length - 1, seconds / PLINKO_STEP));
  const index = Math.floor(position);
  const a = trajectory.frames[index];
  const b = trajectory.frames[Math.min(index + 1, trajectory.frames.length - 1)];
  const blend = position - index;
  return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend,
    angle: a.angle + (b.angle - a.angle) * blend, vx: a.vx + (b.vx - a.vx) * blend, vy: a.vy + (b.vy - a.vy) * blend };
}
