import { useEffect, useMemo, useState } from "react";

type UseEstimatedProgressOptions = {
  active: boolean;
  estimatedDurationMs: number;
  completed?: boolean;
  actualProgress?: number;
  startPercent?: number;
  maxPercent?: number;
};

type EstimatedProgress = {
  elapsedMs: number;
  remainingMs: number;
  progress: number;
  isOverdue: boolean;
};

const MINIMUM_DURATION_MS = 1_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatWaitingTime(durationMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1_000));
  if (totalSeconds < 60) return `${totalSeconds} s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

export function useEstimatedProgress({
  active,
  estimatedDurationMs,
  completed = false,
  actualProgress,
  startPercent = 3,
  maxPercent = 94,
}: UseEstimatedProgressOptions): EstimatedProgress {
  const [elapsedMs, setElapsedMs] = useState(0);
  const durationMs = Math.max(MINIMUM_DURATION_MS, estimatedDurationMs);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedMs(0);
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [active]);

  const progress = useMemo(() => {
    if (completed) return 100;

    if (typeof actualProgress === "number" && Number.isFinite(actualProgress)) {
      return Math.round(clamp(actualProgress, 0, active ? 99 : 100));
    }

    if (!active) return startPercent;

    const safeStart = clamp(startPercent, 0, 90);
    const safeMaximum = clamp(maxPercent, safeStart + 1, 99);
    const ratio = elapsedMs / durationMs;
    const progressAtEstimate = safeStart + (safeMaximum - safeStart) * 0.86;

    if (ratio <= 1) {
      const easedRatio = 1 - Math.pow(1 - ratio, 1.55);
      return Math.round(safeStart + (progressAtEstimate - safeStart) * easedRatio);
    }

    const overtimeRatio = (elapsedMs - durationMs) / (durationMs * 0.7);
    const overtimeEase = 1 - Math.exp(-overtimeRatio);
    return Math.round(progressAtEstimate + (safeMaximum - progressAtEstimate) * overtimeEase);
  }, [actualProgress, active, completed, durationMs, elapsedMs, maxPercent, startPercent]);

  return {
    elapsedMs,
    remainingMs: Math.max(0, durationMs - elapsedMs),
    progress,
    isOverdue: active && elapsedMs > durationMs,
  };
}
