import {
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  assertTokOneAppleTransaction,
  decodeNotificationRenewalInfo,
  decodeNotificationTransaction,
  persistAppleTokOneTransaction,
  verifyAppleSignedNotification,
} from "../_shared/apple-storekit.ts";

Deno.serve(async (req) => {
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await req.json() as { signedPayload?: unknown };
    if (typeof body.signedPayload !== "string" || !body.signedPayload.trim()) {
      return jsonResponse({ error: "signedPayload required" }, 400);
    }

    const { notification, verifier } = await verifyAppleSignedNotification(body.signedPayload);
    const transaction = await decodeNotificationTransaction({ notification, verifier });
    const renewalInfo = await decodeNotificationRenewalInfo({ notification, verifier });

    if (!transaction) {
      await writeAuditLog({
        adminClient,
        functionName: "apple-storekit-webhook",
        status: "success",
        action: "notification_without_transaction",
        actor: {
          userId: null,
          roles: ["apple_storekit_webhook"],
          isServiceRole: true,
          authMode: "service_role",
        },
        request: req,
        metadata: {
          notification_type: notification.notificationType || null,
          subtype: notification.subtype || null,
          notification_uuid: notification.notificationUUID || null,
        },
      });
      return jsonResponse({ received: true, updated: false }, 200);
    }

    const identity = assertTokOneAppleTransaction(transaction);
    const persisted = await persistAppleTokOneTransaction({
      adminClient,
      transaction,
      requestedPlanId: null,
      renewalInfo,
    });

    await writeAuditLog({
      adminClient,
      functionName: "apple-storekit-webhook",
      status: "success",
      action: persisted.updated ? "sync_subscription_notification" : "defer_subscription_notification",
      actor: {
        userId: identity.userId,
        roles: ["apple_storekit_webhook"],
        isServiceRole: true,
        authMode: "service_role",
      },
      request: req,
      targetEntityType: "tok_one_subscriptions",
      targetEntityId: persisted.row?.id ? String(persisted.row.id) : null,
      metadata: {
        notification_type: notification.notificationType || null,
        subtype: notification.subtype || null,
        notification_uuid: notification.notificationUUID || null,
        apple_transaction_id: identity.transactionId,
        apple_original_transaction_id: identity.originalTransactionId,
        apple_product_id: identity.productId,
        deferred_reason: persisted.updated ? null : persisted.reason,
      },
    });

    return jsonResponse({
      received: true,
      updated: persisted.updated,
      reason: persisted.reason,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apple notification verification failed";

    await writeAuditLog({
      adminClient,
      functionName: "apple-storekit-webhook",
      status: "failure",
      action: "verify_subscription_notification",
      actor: {
        userId: null,
        roles: ["apple_storekit_webhook"],
        isServiceRole: true,
        authMode: "service_role",
      },
      request: req,
      errorMessage: message,
    });

    // Apple retries non-2xx responses. Signature/verification failures remain
    // explicit so invalid payloads never mutate subscription entitlements.
    return jsonResponse({ error: "Invalid App Store server notification" }, 400);
  }
});
