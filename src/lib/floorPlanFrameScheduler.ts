export type FloorPlanFrameScheduler<TPayload> = {
  schedule: (payload: TPayload) => void;
  flush: () => void;
  cancel: () => void;
};

export function createFloorPlanFrameScheduler<TPayload>(
  run: (payload: TPayload) => void,
): FloorPlanFrameScheduler<TPayload> {
  let pendingPayload: TPayload | null = null;
  let frameId: number | null = null;

  const runPending = () => {
    frameId = null;
    const payload = pendingPayload;
    pendingPayload = null;
    if (payload !== null) {
      run(payload);
    }
  };

  return {
    schedule: (payload) => {
      pendingPayload = payload;
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(runPending);
    },
    flush: () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      runPending();
    },
    cancel: () => {
      pendingPayload = null;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}
