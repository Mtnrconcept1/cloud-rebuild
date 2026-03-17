import { Capacitor } from "@capacitor/core";

export type AppPlatform = "web" | "ios" | "android";

/** Returns the runtime platform: "web", "ios", or "android". */
export function getPlatform(): AppPlatform {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() as "ios" | "android";
  }
  return "web";
}

/** True when running inside a Capacitor native shell. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** True only in the web browser (not a Capacitor webview). */
export function isWeb(): boolean {
  return !Capacitor.isNativePlatform();
}
