import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Geolocation } from "@capacitor/geolocation";
import type { Position, WatchPositionCallback } from "@capacitor/geolocation";
import { isNative } from "@/lib/platform";
import { watchPosition } from "@/lib/geolocation-native";

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: { watchPosition: vi.fn(), clearWatch: vi.fn() },
}));
vi.mock("@/lib/platform", () => ({ isNative: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const position: Position = {
  timestamp: 123,
  coords: {
    latitude: 46.2, longitude: 6.1, accuracy: 5,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null,
  },
};

describe("native geolocation watch lifecycle", () => {
  let creation: ReturnType<typeof deferred<string>>;
  let callback: WatchPositionCallback;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isNative).mockReturnValue(true);
    creation = deferred<string>();
    vi.mocked(Geolocation.watchPosition).mockImplementation((_options, listener) => {
      callback = listener;
      return creation.promise;
    });
    vi.mocked(Geolocation.clearWatch).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears a watch whose identifier arrives after cleanup, exactly once", async () => {
    const success = vi.fn();
    const error = vi.fn();
    const watch = watchPosition(success, error);
    watch.clear();
    watch.clear();
    callback(position);
    callback(null, new Error("late location error"));
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();

    creation.resolve("late-watch");
    await creation.promise;
    watch.clear();
    callback(position);
    expect(Geolocation.clearWatch).toHaveBeenCalledExactlyOnceWith({ id: "late-watch" });
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards active positions/errors and stops notifications after cleanup", async () => {
    const success = vi.fn();
    const error = vi.fn();
    const watch = watchPosition(success, error, { enableHighAccuracy: false, timeout: 42, maximumAge: 7 });
    expect(Geolocation.watchPosition).toHaveBeenCalledWith(
      { enableHighAccuracy: false, timeout: 42, maximumAge: 7 }, expect.any(Function),
    );
    creation.resolve("active-watch");
    await creation.promise;
    const locationError = new Error("permission denied");
    callback(position);
    callback(null, locationError);
    callback(null);
    expect(success).toHaveBeenCalledExactlyOnceWith(position);
    expect(error).toHaveBeenCalledExactlyOnceWith(locationError);

    watch.clear();
    watch.clear();
    callback(position);
    callback(null, locationError);
    expect(success).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(Geolocation.clearWatch).toHaveBeenCalledExactlyOnceWith({ id: "active-watch" });
  });

  it("reports a rejected creation while the consumer is active", async () => {
    const error = vi.fn();
    const watch = watchPosition(vi.fn(), error);
    const failure = new Error("location service unavailable");
    creation.reject(failure);
    await Promise.resolve();
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    watch.clear();
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it("handles a rejected creation after cleanup without notifying the disposed consumer", async () => {
    const error = vi.fn();
    const watch = watchPosition(vi.fn(), error);
    watch.clear();
    creation.reject(new Error("late creation failure"));
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it.each(["before", "after"])("handles a rejected cleanup %s creation resolves", async (timing) => {
    const error = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Geolocation.clearWatch).mockRejectedValue(new Error("native cleanup failure"));
    const watch = watchPosition(vi.fn(), error);
    if (timing === "before") watch.clear();
    creation.resolve("watch-to-clear");
    await creation.promise;
    if (timing === "after") watch.clear();
    await Promise.resolve();
    expect(warning).toHaveBeenCalledExactlyOnceWith("Unable to stop the native geolocation watch.");
    expect(error).not.toHaveBeenCalled();
    watch.clear();
    expect(Geolocation.clearWatch).toHaveBeenCalledTimes(1);
  });

  it("preserves browser delegation, default options and cleanup", () => {
    vi.mocked(isNative).mockReturnValue(false);
    const browserWatch = vi.fn().mockReturnValue(17);
    const browserClear = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { watchPosition: browserWatch, clearWatch: browserClear } });
    const success = vi.fn();
    const error = vi.fn();
    const watch = watchPosition(success, error);
    expect(browserWatch).toHaveBeenCalledExactlyOnceWith(success, error, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 5000,
    });
    watch.clear();
    expect(browserClear).toHaveBeenCalledExactlyOnceWith(17);
    expect(Geolocation.watchPosition).not.toHaveBeenCalled();
    expect(Geolocation.clearWatch).not.toHaveBeenCalled();
  });

  it("preserves browser option overrides", () => {
    vi.mocked(isNative).mockReturnValue(false);
    const browserWatch = vi.fn().mockReturnValue(18);
    vi.stubGlobal("navigator", { geolocation: { watchPosition: browserWatch, clearWatch: vi.fn() } });
    watchPosition(vi.fn(), vi.fn(), { enableHighAccuracy: false, timeout: 20, maximumAge: 0 });
    expect(browserWatch).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: false, timeout: 20, maximumAge: 0,
    });
  });
});
