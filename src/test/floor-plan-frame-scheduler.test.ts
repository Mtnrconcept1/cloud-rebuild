import { afterEach, describe, expect, it, vi } from "vitest";

import { createFloorPlanFrameScheduler } from "@/lib/floorPlanFrameScheduler";

describe("floor plan frame scheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs only the latest scheduled payload in one animation frame", () => {
    const callbacks: FrameRequestCallback[] = [];
    const run = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const scheduler = createFloorPlanFrameScheduler<string>(run);

    scheduler.schedule("first");
    scheduler.schedule("second");
    scheduler.schedule("third");

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    callbacks[0](16);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("third");
  });

  it("flushes the latest payload immediately and cancels the pending frame", () => {
    const callbacks: FrameRequestCallback[] = [];
    const run = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return 42;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const scheduler = createFloorPlanFrameScheduler<{ x: number }>(run);

    scheduler.schedule({ x: 1 });
    scheduler.schedule({ x: 2 });
    scheduler.flush();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(run).toHaveBeenCalledWith({ x: 2 });

    callbacks[0](16);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancels pending work without running it", () => {
    const callbacks: FrameRequestCallback[] = [];
    const run = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return 7;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const scheduler = createFloorPlanFrameScheduler<number>(run);

    scheduler.schedule(1);
    scheduler.cancel();
    callbacks[0](16);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(run).not.toHaveBeenCalled();
  });
});
