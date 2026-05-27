export type FloorPlanHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};

const DEFAULT_MAX_PAST = 40;

export function createFloorPlanHistory<T>(present: T): FloorPlanHistory<T> {
  return {
    past: [],
    present,
    future: [],
  };
}

export function pushFloorPlanHistory<T>(
  history: FloorPlanHistory<T>,
  nextPresent: T,
  options?: { maxPast?: number; isEqual?: (current: T, next: T) => boolean },
): FloorPlanHistory<T> {
  if (options?.isEqual?.(history.present, nextPresent)) {
    return history;
  }

  const maxPast = Math.max(1, Math.round(options?.maxPast || DEFAULT_MAX_PAST));
  const past = [...history.past, history.present].slice(-maxPast);

  return {
    past,
    present: nextPresent,
    future: [],
  };
}

export function undoFloorPlanHistory<T>(history: FloorPlanHistory<T>): FloorPlanHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoFloorPlanHistory<T>(history: FloorPlanHistory<T>): FloorPlanHistory<T> {
  const next = history.future[0];
  if (next === undefined) return history;

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function resetFloorPlanHistory<T>(
  history: FloorPlanHistory<T>,
  present: T,
): FloorPlanHistory<T> {
  if (history.present === present && history.past.length === 0 && history.future.length === 0) {
    return history;
  }

  return createFloorPlanHistory(present);
}
