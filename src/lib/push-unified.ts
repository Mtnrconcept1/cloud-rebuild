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

export async function isCurrentPushEnabled(userId: string) {
  if (isNative()) {
    const { isCurrentNativePushEnabled } = await import("@/lib/push-native");
    return isCurrentNativePushEnabled(userId);
  }

  const { isCurrentWebPushEnabled } = await import("@/lib/push");
  return isCurrentWebPushEnabled(userId);
}

export async function disablePushForCurrentSession(userId: string) {
  if (isNative()) {
    const { unregisterNativePush } = await import("@/lib/push-native");
    return unregisterNativePush(userId);
  }

  const { disableCurrentWebPush } = await import("@/lib/push");
  return disableCurrentWebPush(userId);
}
