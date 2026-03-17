import { isNative } from "@/lib/platform";

export async function enablePush(userId: string) {
  if (isNative()) {
    const { registerNativePush } = await import("@/lib/push-native");
    return registerNativePush(userId);
  }
  const { enableWebPush } = await import("@/lib/push");
  return enableWebPush(userId);
}

export async function disablePush(userId: string) {
  if (isNative()) {
    const { unregisterNativePush } = await import("@/lib/push-native");
    return unregisterNativePush(userId);
  }
  const { disableWebPush } = await import("@/lib/push");
  return disableWebPush(userId);
}
