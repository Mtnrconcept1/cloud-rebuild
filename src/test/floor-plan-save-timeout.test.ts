import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FloorPlanSaveTimeoutError,
  runFloorPlanSaveWithTimeout,
} from "@/lib/floorPlanSave";

describe("floor plan save timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a completed save and clears its timeout", async () => {
    vi.useFakeTimers();

    await expect(
      runFloorPlanSaveWithTimeout(async (signal) => {
        expect(signal.aborted).toBe(false);
        return "saved";
      }, 25),
    ).resolves.toBe("saved");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled request and returns an actionable error", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;

    const stalledSave = runFloorPlanSaveWithTimeout(
      async (operationSignal) => {
        signal = operationSignal;
        return new Promise<never>(() => undefined);
      },
      25,
    );
    const rejection = expect(stalledSave).rejects.toEqual(
      expect.objectContaining({
        name: "FloorPlanSaveTimeoutError",
        message: expect.stringContaining("Le brouillon est conservé"),
      }),
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(signal?.aborted).toBe(true);
    expect(new FloorPlanSaveTimeoutError()).toBeInstanceOf(Error);
  });
});
