import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "restaurant-media-governance";
const DEFAULT_GALLERY_BUCKET = "images";

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function storageString(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : "";
}

function isSafeStoragePath(storagePath: string) {
  return Boolean(storagePath) &&
    !storagePath.startsWith("/") &&
    !storagePath.includes("\\") &&
    !storagePath.split("/").includes("..");
}

function isAllowedGalleryBucket(storageBucket: string) {
  const configuredGalleryBucket = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim() || DEFAULT_GALLERY_BUCKET;
  return new Set([DEFAULT_GALLERY_BUCKET, "ai-generated-assets", configuredGalleryBucket]).has(storageBucket);
}

function isStorageCleanupAllowed(input: {
  storageBucket: string;
  storagePath: string;
  restaurantId: string;
  userId: string | null;
  isAdmin: boolean;
}) {
  const { storageBucket, storagePath, restaurantId, userId, isAdmin } = input;
  if (!isAllowedGalleryBucket(storageBucket) || !isSafeStoragePath(storagePath)) return false;

  const aiGalleryPrefix = `ai-gallery/${restaurantId}/`;
  if (storagePath.startsWith(aiGalleryPrefix)) return true;
  if (isAdmin) return true;
  if (!userId) return false;

  return storageBucket === DEFAULT_GALLERY_BUCKET && storagePath.startsWith(`${userId}/`);
}

function rpcErrorStatus(error: { code?: string; message?: string }) {
  const message = (error.message || "").toLowerCase();
  if (error.code === "42501" || message.includes("forbidden") || message.includes("not_authenticated")) return 403;
  if (error.code === "P0002" || message.includes("media_not_found")) return 404;
  return 500;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let mediaId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId || !actor.userClient) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    mediaId = maybeUuid(body.mediaId);

    if (action !== "delete_media") throw new HttpError(400, "unsupported_action");
    if (!mediaId) throw new HttpError(400, "media_id_required");

    const { data: media, error: mediaError } = await actor.adminClient
      .from("restaurant_media")
      .select("id, restaurant_id, storage_bucket, storage_path, uploaded_by")
      .eq("id", mediaId)
      .maybeSingle();

    if (mediaError) throw new HttpError(500, mediaError.message);
    if (!media?.restaurant_id) throw new HttpError(404, "media_not_found");

    // Metadata/storage cleanup is a local, non-billable demo action. Keeping
    // it available makes the photo-gallery presentation fully reversible.
    await requireRestaurantAccess(actor, media.restaurant_id, { allowDemo: true });

    const storageBucket = storageString(media.storage_bucket);
    const storagePath = storageString(media.storage_path);
    const shouldRemoveStorage = storageBucket && storagePath && isStorageCleanupAllowed({
      storageBucket,
      storagePath,
      restaurantId: media.restaurant_id,
      userId: actor.userId,
      isAdmin: actor.isAdmin,
    });

    const { data: deletedMedia, error: rpcError } = await actor.userClient.rpc(
      "restaurant_delete_media_metadata",
      { p_media_id: mediaId },
    );

    if (rpcError) {
      throw new HttpError(rpcErrorStatus(rpcError), rpcError.message || "media_delete_failed");
    }

    let storageDeleted = false;
    if (storageBucket && storagePath && shouldRemoveStorage) {
      const { error: storageError } = await actor.adminClient.storage.from(storageBucket).remove([storagePath]);
      if (storageError) throw new HttpError(500, storageError.message);
      storageDeleted = true;
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "delete_media",
      actor,
      request: req,
      targetEntityType: "restaurant_media",
      targetEntityId: mediaId,
      metadata: {
        rid: log.rid,
        restaurant_id: media.restaurant_id,
        storage_bucket: storageBucket || null,
        storage_path: storagePath || null,
        storage_deleted: storageDeleted,
        storage_cleanup_allowed: Boolean(shouldRemoveStorage),
      },
    });

    return jsonResponse({
      ok: true,
      ...(deletedMedia && typeof deletedMedia === "object" ? deletedMedia as Record<string, unknown> : {}),
      storage_deleted: storageDeleted,
      storage_cleanup_allowed: Boolean(shouldRemoveStorage),
    }, 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message, media_id: mediaId });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: "delete_media",
        actor,
        request: req,
        targetEntityType: "restaurant_media",
        targetEntityId: mediaId,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
