#!/usr/bin/env python3
from pathlib import Path
import textwrap


def block(value: str) -> str:
    return textwrap.dedent(value).lstrip("\n")


def replace_once(path: str, before: str, after: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    before_text = block(before)
    after_text = block(after)
    if before_text not in source:
        raise SystemExit(f"Expected source block not found in {path}: {before_text[:140]!r}")
    file_path.write_text(source.replace(before_text, after_text, 1), encoding="utf-8")


def insert_before(path: str, marker: str, addition: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    if marker not in source:
        raise SystemExit(f"Marker not found in {path}: {marker!r}")
    file_path.write_text(source.replace(marker, block(addition) + marker, 1), encoding="utf-8")


# Preserve the production server-only privilege on the sensitive queue helpers.
notification_migration = "supabase/migrations/20260907011600_notification_delivery_reliability.sql"
replace_once(
    notification_migration,
    """
    REVOKE ALL ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
    """,
    """
    REVOKE ALL ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
    """,
)
replace_once(
    notification_migration,
    """
    GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) TO authenticated, service_role;
    """,
    """
    GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) TO service_role;
    """,
)

# Notification push worker: claim atomically, then settle by lease token.
push = "supabase/functions/send-push/index.ts"
insert_before(
    push,
    "Deno.serve(async (req) => {",
    """
    async function settleNotificationDelivery(
      supabaseAdmin: any,
      input: {
        id: string;
        leaseToken: string;
        success: boolean;
        terminal?: boolean;
        terminalStatus?: "failed" | "skipped";
        lastError?: string | null;
        provider?: string | null;
      },
    ) {
      const { error } = await supabaseAdmin.rpc("settle_notification_delivery", {
        p_delivery_id: input.id,
        p_lease_token: input.leaseToken,
        p_success: input.success,
        p_terminal: input.terminal ?? false,
        p_terminal_status: input.terminalStatus ?? "failed",
        p_last_error: input.lastError ?? null,
        p_provider: input.provider ?? null,
      });
      if (error) throw error;
    }

    """,
)
replace_once(
    push,
    """
        // Fetch queued push notification deliveries
        let deliveriesQuery = supabaseAdmin
          .from("notification_deliveries")
          .select("*, notifications!inner(*)")
          .eq("channel", "push")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(50);

        if (userIdFilter) {
          deliveriesQuery = deliveriesQuery.eq("notifications.user_id", userIdFilter);
        }

        const { data: deliveries, error } = await deliveriesQuery;

        if (error) throw error;
    """,
    """
        // Claim deliveries atomically so concurrent cron/admin invocations cannot double-send.
        const { data: deliveries, error } = await supabaseAdmin.rpc("claim_notification_deliveries", {
          p_channel: "push",
          p_limit: 50,
          p_user_id: userIdFilter,
          p_lease_seconds: 120,
        });

        if (error) throw error;
    """,
)
replace_once(
    push,
    """
            const notification = (delivery as any).notifications;
            if (!notification) {
              await supabaseAdmin
                .from("notification_deliveries")
                .update({ status: "failed", last_error: "Notification not found" })
                .eq("id", delivery.id);
              failed++;
              continue;
            }
    """,
    """
            const notification = {
              user_id: delivery.notification_user_id,
              title: delivery.notification_title,
              body: delivery.notification_body,
              data: delivery.notification_data,
            };
            if (!notification.user_id) {
              await settleNotificationDelivery(supabaseAdmin, {
                id: delivery.id,
                leaseToken: delivery.lease_token,
                success: false,
                terminal: true,
                terminalStatus: "failed",
                lastError: "Notification not found",
              });
              failed++;
              continue;
            }
    """,
)
replace_once(
    push,
    """
            if (!tokens || tokens.length === 0) {
              await supabaseAdmin
                .from("notification_deliveries")
                .update({ status: "skipped", last_error: "No active device tokens" })
                .eq("id", delivery.id);
              skipped++;
              continue;
            }
    """,
    """
            if (!tokens || tokens.length === 0) {
              await settleNotificationDelivery(supabaseAdmin, {
                id: delivery.id,
                leaseToken: delivery.lease_token,
                success: false,
                terminal: true,
                terminalStatus: "skipped",
                lastError: "No active device tokens",
                provider: "fcm",
              });
              skipped++;
              continue;
            }
    """,
)
replace_once(
    push,
    """
            await supabaseAdmin
              .from("notification_deliveries")
              .update({
                status: anySent ? "sent" : "failed",
                sent_at: anySent ? new Date().toISOString() : null,
                last_error: anySent ? null : "All tokens failed",
              })
              .eq("id", delivery.id);

            if (anySent) sent++;
            else failed++;
    """,
    """
            await settleNotificationDelivery(supabaseAdmin, {
              id: delivery.id,
              leaseToken: delivery.lease_token,
              success: anySent,
              terminal: false,
              lastError: anySent ? null : "All tokens failed",
              provider: "fcm",
            });

            if (anySent) sent++;
            else failed++;
    """,
)
replace_once(
    push,
    """
            await supabaseAdmin
              .from("notification_deliveries")
              .update({
                status: "failed",
                last_error: err instanceof Error ? err.message : "Unknown error",
              })
              .eq("id", delivery.id);
            failed++;
    """,
    """
            try {
              await settleNotificationDelivery(supabaseAdmin, {
                id: delivery.id,
                leaseToken: delivery.lease_token,
                success: false,
                terminal: false,
                lastError: err instanceof Error ? err.message : "Unknown error",
                provider: "fcm",
              });
            } catch (settleError) {
              log.error("Unable to settle push delivery", {
                message: settleError instanceof Error ? settleError.message : "unknown",
              });
            }
            failed++;
    """,
)

# Notification email worker: keep legacy email_queue unchanged and lease only notification_deliveries.
email = "supabase/functions/send-email/index.ts"
insert_before(
    email,
    "Deno.serve(async (req) => {",
    """
    async function settleNotificationDelivery(
      supabaseAdmin: any,
      input: {
        id: string;
        leaseToken: string;
        success: boolean;
        terminal?: boolean;
        terminalStatus?: "failed" | "skipped";
        lastError?: string | null;
      },
    ) {
      const { error } = await supabaseAdmin.rpc("settle_notification_delivery", {
        p_delivery_id: input.id,
        p_lease_token: input.leaseToken,
        p_success: input.success,
        p_terminal: input.terminal ?? false,
        p_terminal_status: input.terminalStatus ?? "failed",
        p_last_error: input.lastError ?? null,
        p_provider: "resend",
      });
      if (error) throw error;
    }

    """,
)
replace_once(
    email,
    """
        let notificationQuery = supabaseAdmin
          .from("notification_deliveries")
          .select("id, target, notifications!inner(*)")
          .eq("channel", "email")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(10);

        if (userIdFilter) {
          notificationQuery = notificationQuery.eq("notifications.user_id", userIdFilter);
        }

        const { data: notificationEmails, error: notificationEmailError } = await notificationQuery;
    """,
    """
        const { data: notificationEmails, error: notificationEmailError } = await supabaseAdmin.rpc(
          "claim_notification_deliveries",
          {
            p_channel: "email",
            p_limit: 10,
            p_user_id: userIdFilter,
            p_lease_seconds: 120,
          },
        );
    """,
)
replace_once(
    email,
    """
        for (const delivery of notificationEmails || []) {
          const notification = (delivery as any).notifications;
          const target = delivery.target || notification?.target || null;

          if (!notification || !target) {
            await supabaseAdmin
              .from("notification_deliveries")
              .update({ status: "failed", last_error: "Notification or target email missing" })
              .eq("id", delivery.id);
            continue;
          }
    """,
    """
        for (const delivery of notificationEmails || []) {
          const notification = {
            title: delivery.notification_title,
            body: delivery.notification_body,
            data: delivery.notification_data,
          };
          const target = delivery.target || null;

          if (!notification.title || !target) {
            await settleNotificationDelivery(supabaseAdmin, {
              id: delivery.id,
              leaseToken: delivery.lease_token,
              success: false,
              terminal: true,
              terminalStatus: "skipped",
              lastError: "Notification or target email missing",
            });
            continue;
          }
    """,
)
replace_once(
    email,
    """
            await supabaseAdmin
              .from("notification_deliveries")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", delivery.id);

            notificationProcessed++;
    """,
    """
            await settleNotificationDelivery(supabaseAdmin, {
              id: delivery.id,
              leaseToken: delivery.lease_token,
              success: true,
            });

            notificationProcessed++;
    """,
)
replace_once(
    email,
    """
            await supabaseAdmin
              .from("notification_deliveries")
              .update({ status: "failed", last_error: errMsg })
              .eq("id", delivery.id);
            notificationFailed++;
    """,
    """
            try {
              await settleNotificationDelivery(supabaseAdmin, {
                id: delivery.id,
                leaseToken: delivery.lease_token,
                success: false,
                terminal: false,
                lastError: errMsg,
              });
            } catch (settleError) {
              log.error("Unable to settle notification email delivery", {
                message: settleError instanceof Error ? settleError.message : "unknown",
              });
            }
            notificationFailed++;
    """,
)

# Shared OpenAI text boundary: current cost-conscious defaults and common hostile-input protection.
openai = "supabase/functions/_shared/openai.ts"
replace_once(
    openai,
    'import { HttpError } from "./auth.ts";\n',
    'import { HttpError } from "./auth.ts";\nimport { AI_SECURITY_SYSTEM_PROMPT, buildAiSecurityContext } from "./ai-security.ts";\n',
)
replace_once(
    openai,
    """
    export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-5.5";
    const TOK_AI_MINI_MODEL = Deno.env.get("OPENAI_MODEL_TOK_MINI")?.trim() || "gpt-5.4-mini";
    const TOK_AI_STRATEGIC_MODEL = Deno.env.get("OPENAI_MODEL_TOK_STRATEGIC")?.trim() || "gpt-5.5";
    """,
    """
    export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-5.6-terra";
    const TOK_AI_MINI_MODEL = Deno.env.get("OPENAI_MODEL_TOK_MINI")?.trim() || "gpt-5.6-luna";
    const TOK_AI_STRATEGIC_MODEL = Deno.env.get("OPENAI_MODEL_TOK_STRATEGIC")?.trim() || "gpt-5.6-terra";
    """,
)
insert_before(
    openai,
    "export async function createOpenAIResponse(options: OpenAIRequestOptions) {",
    """
    function secureOpenAIInput(input: OpenAIMessage[]): OpenAIMessage[] {
      const userInput = input
        .filter((message) => message.role === "user")
        .map((message) => message.content);
      const securityContext = buildAiSecurityContext(userInput);
      const hardBlockLabels = new Set(["instruction_override", "prompt_boundary_attack"]);
      const shouldBlock = securityContext.risk.score >= 6
        && securityContext.risk.labels.some((label) => hardBlockLabels.has(label));

      if (shouldBlock) {
        throw new HttpError(400, "ai_input_rejected");
      }

      return [
        {
          role: "system",
          content: `${AI_SECURITY_SYSTEM_PROMPT}\n${securityContext.instruction}`,
        },
        ...input,
      ];
    }

    """,
)
replace_once(openai, "    input: options.input,", "    input: secureOpenAIInput(options.input),")

# Expensive intelligence actions outside shared restaurant quota retain non-AI CRUD while adding a server kill switch.
replace_once(
    "supabase/functions/customer-memory/index.ts",
    """
        if (action !== "infer") throw new HttpError(400, "invalid_action");
        if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");
    """,
    """
        if (action !== "infer") throw new HttpError(400, "invalid_action");
        const { data: featureEnabled, error: featureFlagError } = await actor.adminClient.rpc(
          "is_feature_flag_active",
          { p_flag_name: "customer-memory" },
        );
        if (featureFlagError) throw new HttpError(500, "feature_flag_check_unavailable");
        if (featureEnabled !== true) throw new HttpError(503, "feature_disabled");
        if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");
    """,
)
replace_once(
    "supabase/functions/ai-campaign-studio/index.ts",
    """
        if (action !== "generate") throw new HttpError(400, "invalid_action");
        if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");
    """,
    """
        if (action !== "generate") throw new HttpError(400, "invalid_action");
        const { data: featureEnabled, error: featureFlagError } = await actor.adminClient.rpc(
          "is_feature_flag_active",
          { p_flag_name: "ai_marketing_campaigns" },
        );
        if (featureFlagError) throw new HttpError(500, "feature_flag_check_unavailable");
        if (featureEnabled !== true) throw new HttpError(503, "feature_disabled");
        if (!OPENAI_API_KEY) throw new HttpError(503, "ai_service_unavailable");
    """,
)

# Feature flag reads: bounded retries, safe warning and last-known-good fallback.
flags = "src/lib/featureFlags.ts"
replace_once(
    flags,
    """
    export const FEATURE_FLAGS_CACHE_TTL_MS = 180_000;

    let featureFlagsCache: { isAdmin: boolean; fetchedAt: number; flags: FeatureFlag[] } | null = null;

    export function invalidateFeatureFlagsCache() {
      featureFlagsCache = null;
    }
    """,
    """
    export const FEATURE_FLAGS_CACHE_TTL_MS = 180_000;
    export const FEATURE_FLAGS_FETCH_MAX_ATTEMPTS = 3;

    let featureFlagsCache: { isAdmin: boolean; fetchedAt: number; flags: FeatureFlag[] } | null = null;
    const lastKnownGoodFeatureFlags: { admin: FeatureFlag[] | null; public: FeatureFlag[] | null } = {
      admin: null,
      public: null,
    };

    export function invalidateFeatureFlagsCache() {
      featureFlagsCache = null;
    }

    function waitForFeatureFlagRetry(attempt: number) {
      return new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(600, 120 * attempt)));
    }
    """,
)
replace_once(
    flags,
    """
    async function fetchFlags(isAdmin = false): Promise<FeatureFlag[]> {
      if (
        featureFlagsCache &&
        featureFlagsCache.isAdmin === isAdmin &&
        (Date.now() - featureFlagsCache.fetchedAt) < FEATURE_FLAGS_CACHE_TTL_MS
      ) {
        return featureFlagsCache.flags;
      }

      try {
        const { data, error } = await getSupabase()
          .from("feature_flags")
          .select("id, name, label, description, is_active")
          .order("created_at", { ascending: true });

        if (error || !Array.isArray(data)) {
          return buildSafeFallbackFlags();
        }

        const rows = data as FeatureFlagRow[];
        const existingNames = new Set(rows.map((row) => String(row.name || "")));
        const missingDefaults = FEATURE_DEFINITIONS.filter((definition) => !existingNames.has(definition.name));

        if (missingDefaults.length > 0 && isAdmin) {
          await seedMissingDefaultsViaRpc(missingDefaults);
        }

        const resolvedFlags = resolveFlags(rows);
        featureFlagsCache = {
          isAdmin,
          fetchedAt: Date.now(),
          flags: resolvedFlags,
        };
        return resolvedFlags;
      } catch {
        return buildSafeFallbackFlags();
      }
    }
    """,
    """
    async function fetchFlags(isAdmin = false): Promise<FeatureFlag[]> {
      if (
        featureFlagsCache &&
        featureFlagsCache.isAdmin === isAdmin &&
        (Date.now() - featureFlagsCache.fetchedAt) < FEATURE_FLAGS_CACHE_TTL_MS
      ) {
        return featureFlagsCache.flags;
      }

      const cacheKey = isAdmin ? "admin" : "public";
      for (let attempt = 1; attempt <= FEATURE_FLAGS_FETCH_MAX_ATTEMPTS; attempt += 1) {
        try {
          const { data, error } = await getSupabase()
            .from("feature_flags")
            .select("id, name, label, description, is_active")
            .order("created_at", { ascending: true });

          if (error || !Array.isArray(data)) {
            throw new Error("feature_flag_fetch_failed");
          }

          const rows = data as FeatureFlagRow[];
          const existingNames = new Set(rows.map((row) => String(row.name || "")));
          const missingDefaults = FEATURE_DEFINITIONS.filter((definition) => !existingNames.has(definition.name));

          if (missingDefaults.length > 0 && isAdmin) {
            await seedMissingDefaultsViaRpc(missingDefaults);
          }

          const resolvedFlags = resolveFlags(rows);
          featureFlagsCache = {
            isAdmin,
            fetchedAt: Date.now(),
            flags: resolvedFlags,
          };
          lastKnownGoodFeatureFlags[cacheKey] = resolvedFlags;
          return resolvedFlags;
        } catch {
          if (attempt < FEATURE_FLAGS_FETCH_MAX_ATTEMPTS) {
            await waitForFeatureFlagRetry(attempt);
          }
        }
      }

      const lastKnownGood = lastKnownGoodFeatureFlags[cacheKey];
      console.warn("[feature-flags] feature_flag_fetch_failed", {
        isAdmin,
        attempts: FEATURE_FLAGS_FETCH_MAX_ATTEMPTS,
        hasLastKnownGood: Boolean(lastKnownGood),
      });
      return lastKnownGood || buildSafeFallbackFlags();
    }
    """,
)

# Catalogue the four flags used by App routes but missing from the frontend registry.
catalog = "src/lib/featureCatalog.ts"
insert_before(
    catalog,
    '  {\n    name: "commercial-prospection",',
    """
      {
        name: "customer-memory",
        label: "TOK Customer Memory",
        description: "Active la mémoire client explicite et consentie ainsi que son inférence IA.",
        defaultEnabled: true,
        group: "client_features",
        routeTargets: ["/memoire-tok"],
      },
    """,
)
insert_before(
    catalog,
    '  {\n    name: "dashboard-overview",',
    """
      {
        name: "dashboard-campaign-studio",
        label: "Dashboard: Campaign Studio IA",
        description: "Expose la génération et la préparation de campagnes marketing assistées par IA.",
        defaultEnabled: true,
        group: "restaurant_dashboard",
        dependsOn: ["dashboard-restaurateur"],
        routeTargets: ["/dashboard/campaign-studio"],
      },
    """,
)
insert_before(
    catalog,
    '  {\n    name: "admin-marketing-operations",',
    """
      {
        name: "admin-support-resolution",
        label: "Admin: Résolution IA",
        description: "Expose l'assistance IA à l'analyse et à la résolution des incidents support.",
        defaultEnabled: true,
        group: "admin_tools",
        routeTargets: ["/admin/support-resolution"],
        critical: true,
      },
      {
        name: "admin-guardian",
        label: "Admin: Guardian IA",
        description: "Expose l'analyse IA de santé, sécurité et incidents de la plateforme.",
        defaultEnabled: true,
        group: "admin_tools",
        routeTargets: ["/admin/guardian"],
        critical: true,
      },
    """,
)

# Surface intelligence tools on the primary admin hub without changing route/role gates.
insert_before(
    "src/pages/admin/AdminHome.tsx",
    '  {\n    title: "Abonnements restaurateur",',
    """
      {
        title: "Résolution IA",
        description: "Analyser et préparer la résolution des incidents support sensibles.",
        icon: Brain,
        href: "/admin/support-resolution",
        feature: "admin-support-resolution",
        color: "text-violet-500",
      },
      {
        title: "Guardian IA",
        description: "Superviser les signaux de sécurité, santé et incidents de la plateforme.",
        icon: ShieldAlert,
        href: "/admin/guardian",
        feature: "admin-guardian",
        color: "text-red-500",
      },
      {
        title: "TOK Connect",
        description: "Superviser les partenaires, scopes, quotas et webhooks TOK Connect.",
        icon: Rocket,
        href: "/admin/tok-connect",
        feature: "admin-tok-connect",
        color: "text-sky-500",
      },
    """,
)

# Align source-contract tests with the verified model catalogue and admin flag name.
replace_once(
    "src/test/tok-ai-platform-plan.test.ts",
    """
        expect(helper).toContain("selectTokAiModel");
        expect(helper).toContain("gpt-5.4-mini");
        expect(helper).toContain("gpt-5.5");
    """,
    """
        expect(helper).toContain("selectTokAiModel");
        expect(helper).toContain("gpt-5.6-luna");
        expect(helper).toContain("gpt-5.6-terra");
    """,
)
replace_once(
    "src/test/tok-ai-tools.test.ts",
    """
        expect(helper).toContain("OPENAI_API_KEY");
        expect(helper).toContain("OPENAI_MODEL");
        expect(helper).toContain("gpt-5.5");
        expect(helper).toContain("https://api.openai.com/v1/responses");
    """,
    """
        expect(helper).toContain("OPENAI_API_KEY");
        expect(helper).toContain("OPENAI_MODEL");
        expect(helper).toContain("gpt-5.6-luna");
        expect(helper).toContain("gpt-5.6-terra");
        expect(helper).toContain("https://api.openai.com/v1/responses");
    """,
)
replace_once(
    "src/test/notifications-ai-admin-hardening.test.ts",
    '    expect(adminHome).toContain(\'feature: "tok-connect"\');',
    '    expect(adminHome).toContain(\'feature: "admin-tok-connect"\');',
)

# Frontend cost preview recognizes the new defaults while retaining historical model pricing.
insert_before(
    "src/lib/ai/tokAiClient.ts",
    '  "gpt-5.5": { input: 5, output: 30 },',
    """
      "gpt-5.6-terra": { input: 2.5, output: 15 },
      "gpt-5.6-luna": { input: 1, output: 6 },
    """,
)

print("PR 640 implementation patch applied")
