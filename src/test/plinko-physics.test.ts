// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPlinkoTrajectory, PLINKO_GEOMETRY as g, PLINKO_PEGS, PLINKO_STEP, samplePlinkoTrajectory, simulatePlinko } from "@/lib/plinko-physics";

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("physical Plinko presentation", () => {
  it.each([0, 1, 2, 3, 4])("lands in server pocket %s using only initial conditions", (pocket) => {
    for (let seed = 1; seed <= 16; seed++) {
      const trajectory = createPlinkoTrajectory(pocket, seededRandom(seed));
      expect(trajectory.pocket).toBe(pocket);
      expect(trajectory.impacts.length).toBeGreaterThanOrEqual(4);
      expect(trajectory.duration).toBeLessThanOrEqual(5.5);
      // Re-running physics knows nothing about the chosen prize and reproduces
      // the entire path: no target attraction, mid-flight impulse or final snap.
      expect(simulatePlinko(trajectory.launch)).toEqual(trajectory);
      for (let i = 0; i < trajectory.frames.length; i++) {
        const frame = trajectory.frames[i];
        if (frame.x < g.left + g.ballRadius - 1e-6 || frame.x > g.right - g.ballRadius + 1e-6
          || frame.y < g.ballRadius || frame.y > g.floor - g.ballRadius + 1e-6) {
          throw new Error(`Ball outside board at tick ${i}`);
        }
        for (const peg of PLINKO_PEGS) {
          if (Math.hypot(frame.x - peg.x, frame.y - peg.y) < g.ballRadius + g.pegRadius - 1e-6) {
            throw new Error(`Ball inside peg at tick ${i}`);
          }
        }
        if (i && Math.hypot(frame.x - trajectory.frames[i - 1].x, frame.y - trajectory.frames[i - 1].y) > 3) {
          throw new Error(`Ball teleported at tick ${i}`);
        }
      }
      expect(Math.hypot(trajectory.frames.at(-1)!.vx, trajectory.frames.at(-1)!.vy)).toBeLessThan(3);
    }
  });

  it.each([0, 0.5, 1 - Number.EPSILON])("bounds a degenerate RNG with verified physical launches (%s)", (value) => {
    for (let pocket = 0; pocket < 5; pocket++) {
      const trajectory = createPlinkoTrajectory(pocket, () => value);
      expect(trajectory.pocket).toBe(pocket);
      expect(simulatePlinko(trajectory.launch)).toEqual(trajectory);
    }
  });

  it("has acceleration between contacts and reverses normal velocity at a peg", () => {
    const trajectory = createPlinkoTrajectory(0, seededRandom(42));
    expect(trajectory.frames[1].vy - trajectory.frames[0].vy).toBeCloseTo(820 * PLINKO_STEP);
    const impact = trajectory.impacts[0];
    const tick = Math.round(impact.time / PLINKO_STEP);
    const after = trajectory.frames[tick];
    const before = trajectory.frames[tick - 1];
    const peg = PLINKO_PEGS[impact.peg];
    const nx = (after.x - peg.x) / (g.ballRadius + g.pegRadius);
    const ny = (after.y - peg.y) / (g.ballRadius + g.pegRadius);
    expect(before.vx * nx + before.vy * ny).toBeLessThan(0);
    expect(after.vx * nx + after.vy * ny).toBeGreaterThan(0);
    expect(after.angle).not.toBe(trajectory.frames.at(-1)!.angle);
  });

  it("varies paths to the same pocket and interpolates independently of frame rate", () => {
    const paths = Array.from({ length: 12 }, (_, i) => createPlinkoTrajectory(2, seededRandom(i + 1)));
    expect(new Set(paths.map((p) => JSON.stringify(p.launch))).size).toBeGreaterThan(8);
    const path = paths[0];
    const at30fps = samplePlinkoTrajectory(path, 30 / 30);
    expect(samplePlinkoTrajectory(path, 60 / 60)).toEqual(at30fps);
    expect(samplePlinkoTrajectory(path, 120 / 120)).toEqual(at30fps);
    expect(samplePlinkoTrajectory(path, -1)).toEqual(path.frames[0]);
    expect(samplePlinkoTrajectory(path, path.duration + 60)).toEqual(path.frames.at(-1));
    const middle = samplePlinkoTrajectory(path, PLINKO_STEP / 2);
    expect(middle.x).toBeCloseTo((path.frames[0].x + path.frames[1].x) / 2);
  });

  it("rejects invalid board targets and invalid physical inputs", () => {
    for (const pocket of [-1, 5, 0.5, NaN]) expect(() => createPlinkoTrajectory(pocket)).toThrow(RangeError);
    expect(simulatePlinko({ x: NaN, vx: 0, vy: 0 })).toBeNull();
    expect(simulatePlinko({ x: 0, vx: 0, vy: 0 })).toBeNull();
    expect(simulatePlinko({ x: 250, vx: 5000, vy: 0 })).toBeNull();
  });
});
