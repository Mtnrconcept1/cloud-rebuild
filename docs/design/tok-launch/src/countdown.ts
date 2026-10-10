export const TWENTY_DAYS = 20 * 24 * 60 * 60;
export const STORAGE_KEY = 'tok-launch-motion-deadline-v1';
export function splitSeconds(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60, seconds % 60];
}
export function frameRemaining(frame: number, fps: number, initial = TWENTY_DAYS) {
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('FPS must be positive');
  return Math.max(0, initial - Math.floor(Math.max(0, frame) / fps));
}
export function deadlineRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function getDeadline(storage: Pick<Storage, 'getItem' | 'setItem'> | null, now: number) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    const value = Number(saved);
    // Keep expired deadlines: reloading must never restart the launch countdown.
    if (saved && Number.isFinite(value) && value > 0) return value;
  } catch { /* Storage may be unavailable in private browsing. */ }
  const deadline = now + TWENTY_DAYS * 1000;
  try { storage?.setItem(STORAGE_KEY, String(deadline)); } catch { /* In-memory session still works. */ }
  return deadline;
}
