import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Generates an OAuth2 access token from a Firebase service account JSON.
 * Uses the JWT grant type to get a short-lived token for FCM v1 API.
 */
async function getFirebaseAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowSchedulerSecret: true });
    requireRole(actor, ["admin"]);

    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      return jsonResponse({ error: "FIREBASE_SERVICE_ACCOUNT not configured" }, 500, corsHeaders);
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch queued push notification deliveries
    const { data: deliveries, error } = await supabaseAdmin
      .from("notification_deliveries")
      .select("*, notifications(*)")
      .eq("channel", "push")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(50);

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
        metadata: { processed: 0, sent: 0, failed: 0 },
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
                  channel_id: "miamz_orders",
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
            console.error(`FCM send failed for token ${deviceToken.token.substring(0, 10)}...:`, errorBody);

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
        console.error("Error processing delivery:", err);
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
      metadata: { processed: deliveries.length, sent, failed },
    });

    return jsonResponse({ processed: deliveries.length, sent, failed }, 200, corsHeaders);
  } catch (error) {
    console.error("send-push error:", error);
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
