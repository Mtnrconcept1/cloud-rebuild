import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri: string;
};

function maybeDecodeBase64(raw: string) {
  try {
    const decoded = atob(raw.replace(/\s/g, ""));
    return decoded.trim().startsWith("{") ? decoded : null;
  } catch {
    return null;
  }
}

function parseFirebaseServiceAccount(raw: string): FirebaseServiceAccount {
  const trimmed = raw.trim();
  const candidates = [trimmed, maybeDecodeBase64(trimmed)].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<FirebaseServiceAccount>;
      if (
        typeof parsed.project_id === "string" &&
        typeof parsed.client_email === "string" &&
        typeof parsed.private_key === "string" &&
        typeof parsed.token_uri === "string"
      ) {
        return parsed as FirebaseServiceAccount;
      }
    } catch {
      // Try the next supported representation.
    }
  }

  throw new HttpError(500, "firebase_service_account_invalid_json");
}

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\n/g, "\n").trim();
}

function buildFirebaseServiceAccountFromSeparateEnv(): FirebaseServiceAccount | null {
  const projectId = getEnv("FIREBASE_PROJECT_ID");
  const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = getEnv("FIREBASE_PRIVATE_KEY");
  const tokenUri = getEnv("FIREBASE_TOKEN_URI") || "https://oauth2.googleapis.com/token";

  if (!projectId && !clientEmail && !privateKey) return null;
  if (!projectId || !clientEmail || !privateKey) {
    throw new HttpError(500, "firebase_service_account_missing");
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: normalizePrivateKey(privateKey),
    token_uri: tokenUri,
  };
}

function readFirebaseServiceAccountFromEnv(): FirebaseServiceAccount {
  const serviceAccountJson = getEnv("FIREBASE_SERVICE_ACCOUNT");

  if (serviceAccountJson) {
    try {
      return parseFirebaseServiceAccount(serviceAccountJson);
    } catch (error) {
      const fallback = buildFirebaseServiceAccountFromSeparateEnv();
      if (fallback) return fallback;
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, "firebase_service_account_invalid_json");
    }
  }

  const fallback = buildFirebaseServiceAccountFromSeparateEnv();
  if (fallback) return fallback;

  throw new HttpError(500, "firebase_service_account_missing");
}

/**
 * Generates an OAuth2 access token from a Firebase service account JSON.
 * Uses the JWT grant type to get a short-lived token for FCM v1 API.
 */
async function getFirebaseAccessToken(serviceAccount: FirebaseServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  // Import the private key for signing
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signatureInput);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const jwt = `${header}.${payload}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get Firebase access token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("send-push");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowSchedulerSecret: true,
      allowServiceRole: true,
    });
    requireRole(actor, ["admin"]);
    const body = await req.json().catch(() => ({}));
    const userIdFilter = typeof body?.user_id === "string" && body.user_id.trim().length > 0
      ? body.user_id.trim()
      : null;

    const serviceAccount = readFirebaseServiceAccountFromEnv();
    const projectId = serviceAccount.project_id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
    if (!deliveries || deliveries.length === 0) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "send-push",
        action: "process_push_queue",
        status: "success",
        targetEntityType: "notification_deliveries",
        metadata: { processed: 0, sent: 0, failed: 0, user_id: userIdFilter },
      });
      return jsonResponse({ processed: 0 }, 200, corsHeaders);
    }

    // Get Firebase access token
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      try {
        const notification = (delivery as any).notifications;
        if (!notification) {
          await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "failed", last_error: "Notification not found" })
            .eq("id", delivery.id);
          failed++;
          continue;
        }

        // Get device tokens for the user
        const { data: tokens } = await supabaseAdmin
          .from("device_tokens")
          .select("token, platform")
          .eq("user_id", notification.user_id)
          .eq("enabled", true);

        if (!tokens || tokens.length === 0) {
          await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "failed", last_error: "No active device tokens" })
            .eq("id", delivery.id);
          failed++;
          continue;
        }

        let anySent = false;

        for (const deviceToken of tokens) {
          const message = {
            message: {
              token: deviceToken.token,
              notification: {
                title: notification.title,
                body: notification.body,
              },
              data: notification.data ? Object.fromEntries(
                Object.entries(notification.data)
                  .filter(([key]) => key !== "requested_channels")
                  .map(([key, value]) => [
                    key,
                    typeof value === "string" ? value : JSON.stringify(value),
                  ])
              ) : undefined,
              android: {
                priority: "high" as const,
                notification: {
                  channel_id: "tok_orders",
                  sound: "default",
                },
              },
              apns: {
                payload: {
                  aps: {
                    sound: "default",
                    badge: 1,
                  },
                },
              },
              webpush: {
                notification: {
                  icon: "/icon-192.png",
                  badge: "/icon-72.png",
                },
              },
            },
          };

          const response = await fetch(fcmUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
          });

          if (response.ok) {
            anySent = true;
          } else {
            const errorBody = await response.text();
            log.error("FCM send failed for token", { message: errorBody });

            // Remove invalid tokens
            if (response.status === 404 || response.status === 400) {
              await supabaseAdmin
                .from("device_tokens")
                .delete()
                .eq("token", deviceToken.token);
            }
          }
        }

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
      } catch (err) {
        log.error("Error processing delivery", { message: err instanceof Error ? err.message : "unknown" });
        await supabaseAdmin
          .from("notification_deliveries")
          .update({
            status: "failed",
            last_error: err instanceof Error ? err.message : "Unknown error",
          })
          .eq("id", delivery.id);
        failed++;
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
        request: req,
        functionName: "send-push",
        action: "process_push_queue",
        status: "success",
        targetEntityType: "notification_deliveries",
        metadata: { processed: deliveries.length, sent, failed, user_id: userIdFilter },
      });

    return jsonResponse({ processed: deliveries.length, sent, failed }, 200, corsHeaders);
  } catch (error) {
    log.error("send-push error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "send-push",
      action: "process_push_queue",
      status: "failure",
      targetEntityType: "notification_deliveries",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: msg }, 500, corsHeaders);
  }
});
