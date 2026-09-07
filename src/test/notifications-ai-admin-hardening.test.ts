import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const notificationMigrationPath = "supabase/migrations/20260907011600_notification_delivery_reliability.sql";
const aiMigrationPath = "supabase/migrations/20260907011700_ai_feature_flag_enforcement.sql";

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("TOK notification reliability hardening", () => {
  it("leases notification deliveries atomically and retries transient failures", () => {
    const sql = readProjectFile(notificationMigrationPath);
    const pushWorker = readProjectFile("supabase/functions/send-push/index.ts");
    const emailWorker = readProjectFile("supabase/functions/send-email/index.ts");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS next_attempt_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS max_attempts");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lease_token");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lease_expires_at");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.claim_notification_deliveries");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("attempts = nd.attempts + 1");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.settle_notification_delivery");
    expect(sql).toContain("ELSE 'retrying'");
    expect(sql).toContain("max_attempts");

    expect(pushWorker).toContain("claim_notification_deliveries");
    expect(pushWorker).toContain("settle_notification_delivery");
    expect(emailWorker).toContain("claim_notification_deliveries");
    expect(emailWorker).toContain("settle_notification_delivery");
  });

  it("dispatches due campaigns automatically without allowing duplicate concurrent dispatch", () => {
    const sql = readProjectFile(notificationMigrationPath);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.dispatch_due_notification_campaigns");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("IF v_campaign.status = 'sent' THEN");
    expect(sql).toContain("tok-dispatch-due-notification-campaigns");
    expect(sql).toContain("notification-dispatch");
    expect(sql).toContain('"process_due":true');
  });

  it("keeps transactional notifications server-required while respecting channel preferences", () => {
    const sql = readProjectFile(notificationMigrationPath);

    expect(sql).toContain("p_category <> 'transactional'");
    expect(sql).toContain("v_categories ->> p_category");
    expect(sql).toContain("v_channels ->> 'push'");
    expect(sql).toContain("v_channels ->> 'email'");
  });
});

describe("TOK push activation coverage", () => {
  it("exposes explicit push activation from the role-agnostic account security page", () => {
    const settings = readProjectFile("src/components/notifications/PushNotificationSettings.tsx");
    const securityPage = readProjectFile("src/pages/AccountSecurity.tsx");
    const unifiedPush = readProjectFile("src/lib/push-unified.ts");

    expect(settings).toContain("enablePush");
    expect(settings).toContain("disablePushForCurrentSession");
    expect(settings).toContain("isCurrentPushEnabled");
    expect(settings).toContain("if (!result.ok)");
    expect(settings).toContain("result.reason");
    expect(unifiedPush).toContain("isCurrentPushEnabled");
    expect(unifiedPush).toContain("disablePushForCurrentSession");
    expect(securityPage).toContain("PushNotificationSettings");
  });
});

describe("TOK AI server governance", () => {
  it("enforces the shared AI security layer at the common OpenAI boundary", () => {
    const openai = readProjectFile("supabase/functions/_shared/openai.ts");

    expect(openai).toContain('from "./ai-security.ts"');
    expect(openai).toContain("buildAiSecurityContext");
    expect(openai).toContain("AI_SECURITY_SYSTEM_PROMPT");
    expect(openai).toContain("ai_input_rejected");
    expect(openai).toContain('message.role === "user"');
  });

  it("uses current cost-conscious GPT-5.6 defaults while preserving env overrides", () => {
    const openai = readProjectFile("supabase/functions/_shared/openai.ts");

    expect(openai).toContain('|| "gpt-5.6-luna"');
    expect(openai).toContain('|| "gpt-5.6-terra"');
    expect(openai).not.toContain('|| "gpt-5.4-mini"');
    expect(openai).not.toContain('|| "gpt-5.5"');
    expect(openai).toContain("OPENAI_MODEL_TOK_MINI");
    expect(openai).toContain("OPENAI_MODEL_TOK_STRATEGIC");
  });

  it("turns existing AI feature flags into server-side quota kill switches", () => {
    const sql = readProjectFile(aiMigrationPath);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota");
    expect(sql).toContain("public.is_feature_flag_active(v_feature)");
    expect(sql).toContain("'reason', 'feature_disabled'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota");
  });

  it("enforces image-generation kill switches before the OpenAI image request", () => {
    const imageFunction = readProjectFile("supabase/functions/ai-image-enhance/index.ts");

    expect(imageFunction).toContain("requireActiveAiFeature");
    expect(imageFunction).toContain('"ai_premium_image_generation"');
    expect(imageFunction).toContain('marketingAssetMode ? "ai_marketing_campaigns" : "ai_photo_enhancer"');
    expect(imageFunction).toContain('rpc("is_feature_flag_active"');
    expect(imageFunction).toContain("feature_flag_check_unavailable");
    expect(imageFunction).toContain("feature_disabled");
  });
});

describe("TOK admin and feature-flag resilience", () => {
  it("catalogues every intelligence flag used by App routes", () => {
    const catalog = readProjectFile("src/lib/featureCatalog.ts");

    for (const flag of [
      "customer-memory",
      "dashboard-campaign-studio",
      "admin-support-resolution",
      "admin-guardian",
    ]) {
      expect(catalog).toContain(`name: "${flag}"`);
    }
  });

  it("retries transient flag reads and preserves a last-known-good snapshot", () => {
    const flags = readProjectFile("src/lib/featureFlags.ts");

    expect(flags).toContain("FEATURE_FLAGS_FETCH_MAX_ATTEMPTS");
    expect(flags).toContain("lastKnownGoodFeatureFlags");
    expect(flags).toContain("feature_flag_fetch_failed");
    expect(flags).toContain("console.warn");
    expect(flags).toContain("buildSafeFallbackFlags()");
  });

  it("surfaces the three intelligence admin tools on the main desktop admin hub", () => {
    const adminHome = readProjectFile("src/pages/admin/AdminHome.tsx");

    expect(adminHome).toContain('href: "/admin/support-resolution"');
    expect(adminHome).toContain('feature: "admin-support-resolution"');
    expect(adminHome).toContain('href: "/admin/guardian"');
    expect(adminHome).toContain('feature: "admin-guardian"');
    expect(adminHome).toContain('href: "/admin/tok-connect"');
    expect(adminHome).toContain('feature: "admin-tok-connect"');
  });
});
