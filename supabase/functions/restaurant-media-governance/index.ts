import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "restaurant-media-governance";
const LEGACY_GALLERY_BUCKET = "images";
const RESTAURANT_MEDIA_BUCKET = "restaurant-images";
const PRIVATE_AI_BUCKET = "ai-generated-assets";

function maybeUuid(raw: unknown) {
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

function storageString(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : "";
}

function boundedText(raw: unknown, max = 240) {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function isSafeStoragePath(storagePath: string) {
  return Boolean(storagePath) &&
    !storagePath.startsWith("/") &&
    !storagePath.includes("\\") &&
    !storagePath.split("/").includes("..");
}

function isAllowedGalleryBucket(storageBucket: string) {
  const configuredGalleryBucket = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim();
  return new Set([
    LEGACY_GALLERY_BUCKET,
    RESTAURANT_MEDIA_BUCKET,
    PRIVATE_AI_BUCKET,
    ...(configuredGalleryBucket ? [configuredGalleryBucket] : []),
  ]).has(storageBucket);
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

  if (storageBucket === LEGACY_GALLERY_BUCKET && storagePath.startsWith(`ai-gallery/${restaurantId}/`)) return true;
  if (storageBucket === RESTAURANT_MEDIA_BUCKET && storagePath.startsWith(`${restaurantId}/ai-gallery/`)) return true;
  if (isAdmin) return true;
  if (!userId) return false;

  return storageBucket === LEGACY_GALLERY_BUCKET && storagePath.startsWith(`${userId}/`);
}

function isAiCreationSourceAllowed(storageBucket: string, storagePath: string, restaurantId: string) {
  if (!isAllowedGalleryBucket(storageBucket) || !isSafeStoragePath(storagePath)) return false;
  if (storageBucket === LEGACY_GALLERY_BUCKET) return storagePath.startsWith(`ai-gallery/${restaurantId}/`);
  if (storageBucket === RESTAURANT_MEDIA_BUCKET) return storagePath.startsWith(`${restaurantId}/ai-gallery/`);
  if (storageBucket === PRIVATE_AI_BUCKET) return storagePath.startsWith(`ai-generated/${restaurantId}/`);

  const configuredGalleryBucket = Deno.env.get("TOK_GALLERY_IMAGE_BUCKET")?.trim();
  return Boolean(configuredGalleryBucket && storageBucket === configuredGalleryBucket && storagePath.includes(`/${restaurantId}/`));
}

function metadataRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function optionalBoolean(raw: unknown) {
  return typeof raw === "boolean" ? raw : null;
}

function normalizePositionHint(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(10000, Math.floor(value))) : 0;
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
  let action = "";
  let mediaId: string | null = null;
  let assetId: string | null = null;
  let restaurantId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    await assertProductionFlowAllowed(actor, "gestion de média réelle");
    if (!actor.userId || !actor.userClient) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    action = typeof body.action === "string" ? body.action : "";
    mediaId = maybeUuid(body.mediaId);
    assetId = maybeUuid(body.assetId);
    restaurantId = maybeUuid(body.restaurantId);

    if (action === "add_ai_creation_to_gallery") {
      if (!restaurantId) throw new HttpError(400, "restaurant_required");
      if (!assetId) throw new HttpError(400, "image_id_required");

      await requireRestaurantAccess(actor, restaurantId);

      const { data: asset, error: assetError } = await actor.adminClient
        .from("ai_generated_assets")
        .select("id, restaurant_id, asset_url, storage_bucket, storage_path, asset_type, model, title, metadata, created_at")
        .eq("id", assetId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (assetError) throw new HttpError(500, assetError.message);
      if (!asset?.id) throw new HttpError(404, "media_not_found");

      const assetMetadata = metadataRecord(asset.metadata);
      const sourceBucket = storageString(assetMetadata.gallery_storage_bucket) || storageString(asset.storage_bucket);
      const sourcePath = storageString(assetMetadata.gallery_storage_path) || storageString(asset.storage_path);
      if (!isAiCreationSourceAllowed(sourceBucket, sourcePath, restaurantId)) {
        throw new HttpError(422, "media_storage_invalid");
      }

      const targetPath = `${restaurantId}/ai-gallery/${assetId}.png`;
      const { data: existingMedia, error: existingMediaError } = await actor.adminClient
        .from("restaurant_media")
        .select("id, media_url, storage_bucket, storage_path, metadata")
        .eq("restaurant_id", restaurantId)
        .eq("storage_bucket", RESTAURANT_MEDIA_BUCKET)
        .eq("storage_path", targetPath)
        .maybeSingle();

      if (existingMediaError) throw new HttpError(500, existingMediaError.message);
      if (existingMedia?.id) {
        return jsonResponse({ ok: true, media: existingMedia, adopted: false, already_exists: true }, 200, cors);
      }

      if (sourceBucket !== RESTAURANT_MEDIA_BUCKET || sourcePath !== targetPath) {
        const { data: sourceBlob, error: downloadError } = await actor.adminClient.storage.from(sourceBucket).download(sourcePath);
        if (downloadError || !sourceBlob) throw new HttpError(500, downloadError?.message || "media_source_download_failed");

        const { error: uploadError } = await actor.adminClient.storage.from(RESTAURANT_MEDIA_BUCKET).upload(
          targetPath,
          sourceBlob,
          {
            upsert: true,
            contentType: sourceBlob.type || "image/png",
            cacheControl: "31536000",
          },
        );
        if (uploadError) throw new HttpError(500, uploadError.message);
      }

      const { data: publicUrlData } = actor.adminClient.storage.from(RESTAURANT_MEDIA_BUCKET).getPublicUrl(targetPath);
      const galleryImageUrl = publicUrlData.publicUrl;
      if (!galleryImageUrl) throw new HttpError(500, "media_public_url_missing");

      const { data: lastPositionRow, error: positionError } = await actor.adminClient
        .from("restaurant_media")
        .select("position")
        .eq("restaurant_id", restaurantId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (positionError) throw new HttpError(500, positionError.message);

      const positionHint = normalizePositionHint(body.positionHint);
      const nextPosition = Math.max(Number(lastPositionRow?.position ?? -1) + 1, positionHint);
      const tool = boundedText(body.tool, 40) || "unknown";
      const dishName = boundedText(body.dishName || assetMetadata.dish_name || asset.title, 160);
      const altText = boundedText(body.altText || asset.title, 240) || "Création TOK";
      const tokWatermarkRequired = optionalBoolean(body.tokWatermarkRequired);
      const mediaMetadata = {
        source: "tok_ai_generation",
        dish_name: dishName || null,
        tool,
        ai_model: asset.model || null,
        output_resolution: assetMetadata.output_resolution || null,
        output_quality: assetMetadata.requested_output_quality || assetMetadata.output_quality || null,
        output_size: assetMetadata.request_image_size || null,
        generation_seed: assetMetadata.generation_seed || null,
        generated_asset_id: asset.id,
        tok_watermark_required: tokWatermarkRequired,
        generated_at: asset.created_at || null,
        added_to_gallery_at: new Date().toISOString(),
      };

      const { data: insertedMedia, error: insertError } = await actor.adminClient
        .from("restaurant_media")
        .insert({
          restaurant_id: restaurantId,
          media_url: galleryImageUrl,
          alt_text: altText,
          media_type: "photo_ai_tok",
          uploaded_by: actor.userId,
          position: nextPosition,
          is_primary: false,
          storage_bucket: RESTAURANT_MEDIA_BUCKET,
          storage_path: targetPath,
          metadata: mediaMetadata,
        })
        .select("id, restaurant_id, media_url, alt_text, media_type, position, storage_bucket, storage_path, metadata, created_at")
        .single();

      if (insertError || !insertedMedia) throw new HttpError(500, insertError?.message || "media_insert_failed");

      const updatedAssetMetadata = {
        ...assetMetadata,
        gallery_storage_bucket: RESTAURANT_MEDIA_BUCKET,
        gallery_storage_path: targetPath,
        gallery_image_url: galleryImageUrl,
      };
      const { error: assetUpdateError } = await actor.adminClient
        .from("ai_generated_assets")
        .update({ metadata: updatedAssetMetadata })
        .eq("id", assetId)
        .eq("restaurant_id", restaurantId);
      if (assetUpdateError) {
        log.warn("asset_gallery_metadata_update_failed", { asset_id: assetId, message: assetUpdateError.message });
      }

      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "success",
        action,
        actor,
        request: req,
        targetEntityType: "restaurant_media",
        targetEntityId: insertedMedia.id,
        metadata: {
          rid: log.rid,
          restaurant_id: restaurantId,
          generated_asset_id: assetId,
          source_bucket: sourceBucket,
          source_path: sourcePath,
          storage_bucket: RESTAURANT_MEDIA_BUCKET,
          storage_path: targetPath,
        },
      });

      return jsonResponse({
        ok: true,
        media: insertedMedia,
        adopted: sourceBucket !== RESTAURANT_MEDIA_BUCKET || sourcePath !== targetPath,
        already_exists: false,
        gallery_storage_bucket: RESTAURANT_MEDIA_BUCKET,
        gallery_storage_path: targetPath,
        gallery_image_url: galleryImageUrl,
      }, 200, cors);
    }

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
    log.error("request_failed", { status, message, action, media_id: mediaId, asset_id: assetId, restaurant_id: restaurantId });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: action || "unknown",
        actor,
        request: req,
        targetEntityType: assetId ? "ai_generated_assets" : "restaurant_media",
        targetEntityId: assetId || mediaId,
        errorMessage: message,
        metadata: { rid: log.rid, restaurant_id: restaurantId },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
