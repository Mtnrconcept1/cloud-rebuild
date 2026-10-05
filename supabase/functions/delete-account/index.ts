import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  listUserStorageObjects,
  removeUserStorageObjects,
} from "../_shared/user-storage-cleanup.ts";

type DeleteAccountBody = {
  target_user_id?: unknown;
  confirmation_user_id?: unknown;
  reason?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function databaseErrorStatus(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

  if (code === "23503" || code === "23514") return 409;
  if (code === "42501") return 403;
  if (code === "22023" || code === "22P02") return 400;
  return 500;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("delete-account");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let targetUserId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    let body: DeleteAccountBody = {};
    try {
      body = await req.json() as DeleteAccountBody;
    } catch {
      // The profile self-delete flow intentionally sends an empty request.
    }

    const requestedTargetUserId = normalizeText(body.target_user_id);
    const isAdminTargetDeletion = requestedTargetUserId.length > 0;
    targetUserId = isAdminTargetDeletion ? requestedTargetUserId : actor.userId;

    if (!UUID_PATTERN.test(targetUserId)) {
      throw new HttpError(400, "Invalid user id");
    }

    if (isAdminTargetDeletion) {
      requireUserRole(actor, ["admin"]);

      const confirmationUserId = normalizeText(body.confirmation_user_id);
      const reason = normalizeText(body.reason);

      if (confirmationUserId !== targetUserId) {
        throw new HttpError(400, "The confirmation does not match the user id.");
      }
      if (reason.length < 8 || reason.length > 500) {
        throw new HttpError(400, "A reason between 8 and 500 characters is required.");
      }
    }

    // Read Storage metadata before deleting the Auth/database identity. The
    // actual objects are removed only after the guarded database deletion has
    // succeeded, so a 409/403 safeguard never destroys files prematurely.
    const storageObjects = await listUserStorageObjects(
      actor.adminClient,
      targetUserId,
    );

    if (isAdminTargetDeletion) {
      if (!actor.userClient) {
        throw new HttpError(403, "Administrator user session required");
      }

      const { error: rpcError } = await actor.userClient.rpc(
        "admin_delete_user_account",
        {
          p_user_id: targetUserId,
          p_confirmation_user_id: normalizeText(body.confirmation_user_id),
          p_reason: normalizeText(body.reason),
        },
      );

      if (rpcError) {
        throw new HttpError(databaseErrorStatus(rpcError), rpcError.message);
      }
    } else {
      const { error: rpcError } = await actor.adminClient.rpc(
        "delete_user_gdpr_cascade",
        { p_user_id: targetUserId },
      );

      if (rpcError) {
        throw new HttpError(databaseErrorStatus(rpcError), rpcError.message);
      }
    }

    const storageCleanup = await removeUserStorageObjects(
      actor.adminClient,
      storageObjects,
    );
    const storageCleanupWarning = storageCleanup.failures.length > 0
      ? "Le compte est supprimé, mais certains fichiers Storage nécessitent une reprise de nettoyage."
      : null;

    if (storageCleanupWarning) {
      log.error("storage_cleanup_incomplete_after_user_delete", {
        target_user_id: targetUserId,
        discovered_count: storageCleanup.discovered_count,
        removed_count: storageCleanup.removed_count,
        failure_count: storageCleanup.failures.length,
        failures: storageCleanup.failures,
        severity: "critical",
      });
    } else {
      log.info("user_deleted", {
        target_user_id: targetUserId,
        storage_removed_count: storageCleanup.removed_count,
      });
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: "delete-account",
      status: "success",
      action: isAdminTargetDeletion ? "admin_delete_user" : "delete_user",
      actor,
      request: req,
      targetEntityType: "user",
      targetEntityId: targetUserId,
      metadata: {
        storage_discovered_count: storageCleanup.discovered_count,
        storage_removed_count: storageCleanup.removed_count,
        storage_cleanup_failure_count: storageCleanup.failures.length,
      },
    });

    return jsonResponse({
      success: true,
      user_id: targetUserId,
      storage_removed_count: storageCleanup.removed_count,
      storage_cleanup_warning: storageCleanupWarning,
    }, 200, corsHeaders);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";

    log.error("delete_user_failed", {
      target_user_id: targetUserId,
      actor_user_id: actor?.userId || null,
      message,
    });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: "delete-account",
        status: "failure",
        action: targetUserId && targetUserId !== actor.userId
          ? "admin_delete_user"
          : "delete_user",
        actor,
        request: req,
        targetEntityType: "user",
        targetEntityId: targetUserId,
        errorMessage: message,
      }).catch(() => {});
    }

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
