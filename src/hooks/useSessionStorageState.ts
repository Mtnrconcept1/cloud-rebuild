import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";

function readSessionValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const rawValue = window.sessionStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useSessionStorageState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const initialValueRef = useRef(initialValue);
  const keyRef = useRef(key);
  const skipNextWriteRef = useRef(false);
  const [value, setValue] = useState<T>(() => readSessionValue(key, initialValueRef.current));

  useEffect(() => {
    if (keyRef.current === key) return;

    keyRef.current = key;
    skipNextWriteRef.current = true;
    setValue(readSessionValue(key, initialValueRef.current));
  }, [key]);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Session storage can be unavailable in private browsing or restricted embeds.
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage errors; resetting React state is still useful.
    }
    setValue(initialValueRef.current);
  }, [key]);

  return [value, setValue, clear];
}
