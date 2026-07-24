import { Geolocation } from "@capacitor/geolocation";
import type { CallbackID } from "@capacitor/geolocation";
import { isNative } from "@/lib/platform";
import { isPrivacyCategoryAllowed } from "@/lib/privacyConsentState";

function assertGeolocationConsent() {
  if (!isPrivacyCategoryAllowed("geolocation")) {
    throw new DOMException(
      "La localisation est désactivée dans vos préférences de confidentialité TOK.",
      "NotAllowedError",
    );
  }
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  assertGeolocationConsent();

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
  try {
    assertGeolocationConsent();
  } catch (error) {
    queueMicrotask(() => onError(error));
    return { clear: () => undefined };
  }

  if (isNative()) {
    let callbackId: CallbackID | null = null;

    Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 5000,
      },
      (position, err) => {
        if (err) {
          onError(err);
        } else if (position) {
          onSuccess(position as unknown as GeolocationPosition);
        }
      }
    ).then((id) => {
      callbackId = id;
    });

    return {
      clear: () => {
        if (callbackId !== null) {
          Geolocation.clearWatch({ id: callbackId });
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
