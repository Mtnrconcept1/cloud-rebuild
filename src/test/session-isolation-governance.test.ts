import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function readMigration(slug: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const fileName = readdirSync(migrationsDir).find((name) => name.includes(slug));

  expect(fileName, `migration ${slug} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

describe("session isolation governance", () => {
  it("clears local notifications, push tokens and cart state through the central auth logout flow", () => {
    const auth = read("src/lib/auth.tsx");
    const cart = read("src/lib/cart.tsx");
    const cleanup = read("src/lib/sessionCleanup.ts");
    const pushUnified = read("src/lib/push-unified.ts");
    const app = read("src/App.tsx");

    expect(auth).toContain("clearAuthenticatedBrowserState");
    expect(auth).toContain("disablePushForCurrentSession");
    expect(auth).toContain("queryClient.clear()");
    expect(cart).toContain("lastAuthenticatedUserIdRef");
    expect(cart).toContain("clearCartBrowserState");
    expect(cleanup).toContain("miamz-cart");
    expect(cleanup).toContain("miamz-cart-metadata");
    expect(cleanup).toContain("miamz-order-mode");
    expect(pushUnified).toContain("disablePushForCurrentSession");
    expect(app).toContain("const { user } = useAuth();");
    expect(app).toContain("setupNativePushListeners");
    expect(app).toContain("user?.id");
  });

  it("keeps notification reads, realtime and RLS scoped to the notification recipient", () => {
    const center = read("src/hooks/useNotificationCenter.ts");
    const realtime = read("src/lib/realtimeNotifications.ts");
    const migration = readMigration("notification_recipient_isolation");

    expect(center).toContain('.eq("user_id", user!.id)');
    expect(center).toContain('.eq("user_id", user.id)');
    expect(realtime).toContain("filter: `user_id=eq.${userId}`");
    expect(realtime).toContain("removeChannel");
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can view their notifications"');
    expect(migration).toContain('CREATE POLICY "notifications_recipient_select"');
    expect(migration).toContain("user_id = (SELECT auth.uid())");
    expect(migration).not.toContain("OR public.auth_is_admin()");
    expect(migration).not.toContain("has_role(auth.uid(), 'admin')");
  });

  it("keeps the current-device push token available for precise logout cleanup", () => {
    const webPush = read("src/lib/push.ts");
    const nativePush = read("src/lib/push-native.ts");

    expect(existsSync(resolve(root, "src/lib/sessionCleanup.ts"))).toBe(true);
    expect(webPush).toContain("WEB_PUSH_TOKEN_STORAGE_KEY");
    expect(webPush).toContain("disableCurrentWebPush");
    expect(webPush).toContain('.eq("token", token)');
    expect(nativePush).toContain("NATIVE_PUSH_TOKEN_STORAGE_KEY");
    expect(nativePush).toContain('.eq("token", storedToken)');
  });
});
