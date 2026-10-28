export const FLOOR_PLAN_SAVE_TIMEOUT_MS = 12_000;

export class FloorPlanSaveTimeoutError extends Error {
  constructor() {
    super(
      "La sauvegarde a pris trop de temps. Le brouillon est conservé ; vérifiez la connexion puis réessayez.",
    );
    this.name = "FloorPlanSaveTimeoutError";
  }
}

export async function runFloorPlanSaveWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = FLOOR_PLAN_SAVE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new FloorPlanSaveTimeoutError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
