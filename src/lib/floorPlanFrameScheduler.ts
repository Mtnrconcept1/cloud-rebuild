export type FloorPlanFrameScheduler<TPayload> = {
  schedule: (payload: TPayload) => void;
  flush: () => void;
  cancel: () => void;
};

export type FloorPlanPointerMovePayload = {
  clientX: number;
  clientY: number;
};

export type FloorPlanPointerMoveScheduler = FloorPlanFrameScheduler<FloorPlanPointerMovePayload> & {
  scheduleFromEvent: (event: PointerEvent, pointerId: number) => boolean;
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

export function createFloorPlanPointerMoveScheduler(
  run: (payload: FloorPlanPointerMovePayload) => void,
): FloorPlanPointerMoveScheduler {
  const scheduler = createFloorPlanFrameScheduler(run);

  return {
    ...scheduler,
    scheduleFromEvent: (event, pointerId) => {
      if (event.pointerId !== pointerId) return false;

      scheduler.schedule({
        clientX: event.clientX,
        clientY: event.clientY,
      });

      if (event.cancelable) {
        event.preventDefault();
      }

      return true;
    },
  };
}
