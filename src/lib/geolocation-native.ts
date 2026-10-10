import { Geolocation } from "@capacitor/geolocation";
import type { CallbackID } from "@capacitor/geolocation";
import { isNative } from "@/lib/platform";

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  if (isNative()) {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
    return pos as unknown as GeolocationPosition;
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

export function watchPosition(
  onSuccess: (pos: GeolocationPosition) => void,
  onError: (err: any) => void,
  options?: PositionOptions
): { clear: () => void } {
  if (isNative()) {
    let callbackId: CallbackID | null = null;
    let cleared = false;

    const clearNativeWatch = async (id: CallbackID) => {
      try {
        await Geolocation.clearWatch({ id });
      } catch {
        // The consumer has already stopped listening; do not call it after cleanup.
        console.warn("Unable to stop the native geolocation watch.");
      }
    };

    Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 5000,
      },
      (position, err) => {
        if (cleared) return;
        if (err) {
          onError(err);
        } else if (position) {
          onSuccess(position as unknown as GeolocationPosition);
        }
      }
    ).then(
      (id) => {
        if (cleared) {
          void clearNativeWatch(id);
        } else {
          callbackId = id;
        }
      },
      (error) => {
        if (!cleared) onError(error);
      },
    );

    return {
      clear: () => {
        if (cleared) return;
        cleared = true;
        if (callbackId !== null) {
          void clearNativeWatch(callbackId);
          callbackId = null;
        }
      },
    };
  }

  const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: options?.enableHighAccuracy ?? true,
    timeout: options?.timeout ?? 10000,
    maximumAge: options?.maximumAge ?? 5000,
  });

  return {
    clear: () => navigator.geolocation.clearWatch(watchId),
  };
}
