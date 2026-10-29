import { buildNativePrintTemplate, nativePrintContractMatches, hasArtworkOverlays, NATIVE_ARTWORK_VERSION } from "../_shared/print/artwork.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { matchesGeneratedPrintFormat } from "../_shared/print/source-format.ts";
import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { buildPrintPdf } from "../_shared/print/pdf.ts";
import { isSinglePagePrintProduct, isNativeArtworkProduct } from "../_shared/print/catalog.ts";

const BUCKET = "print-production-files";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireUuid(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!UUID.test(normalized)) throw new HttpError(400, `${field} invalide`);
  return normalized;
}

function numberOr(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function signedUrl(adminClient: any, path: string | null) {
  if (!path) return null;
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return null;
  return data?.signedUrl || null;
}

async function bestEffortRollback(adminClient: any, path: string, documentId: string, documentInserted: boolean) {
  try {
    await adminClient.storage.from(BUCKET).remove([path]);
  } catch {
    // The orphaned private object is preferable to masking the primary DB error.
  }
  if (!documentInserted) return;
  try {
    await adminClient.from("print_documents").delete().eq("id", documentId);
  } catch {
    // The cleanup path is best-effort and must never hide the original failure.
  }
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflightResponse = handleCorsPreflight(req, cors);
  if (preflightResponse) return preflightResponse;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["restaurateur", "admin"]);
    const body = asRecord(await req.json().catch(() => ({})));
    const action = String(body.action || "create").trim().toLowerCase();
    const restaurantId = requireUuid(body.restaurantId, "restaurantId");
    await requireRestaurantAccess(actor, restaurantId);

    if (action === "approve") {
      await assertProductionFlowAllowed(actor, "approbation BAT impression");
      const exportId = requireUuid(body.exportId, "exportId");
      const { data: existing, error: existingError } = await adminClient
        .from("print_exports")
        .select("id, restaurant_id, status, production_storage_path, preflight")
        .eq("id", exportId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw new HttpError(404, "Export impression introuvable");
      const pf = asRecord(existing.preflight);
      if (body.proofAcknowledged !== true) throw new HttpError(400, "Vérifiez le PDF, les marges, les textes et la résolution avant d’approuver ce BAT.");
      if (!["ready", "approved"].includes(existing.status) || !existing.production_storage_path
        || pf.ready !== true || pf.nativeArtworkVersion !== NATIVE_ARTWORK_VERSION
        || asRecord(pf.artworkReview).ready !== true || !/^[a-f0-9]{64}$/.test(String(pf.sourceSha256 || ""))) {
        throw new HttpError(409, "Un nouveau BAT natif contrôlé doit être généré avant approbation");
      }

      const { data: approved, error: approvalError } = await adminClient
        .from("print_exports")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: actor.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", exportId)
        .eq("restaurant_id", restaurantId)
        .in("status", ["ready", "approved"])
        .select("id, status, preflight, production_storage_path")
        .single();
      if (approvalError) throw approvalError;

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-export",
        action: "approve_proof",
        status: "success",
        targetEntityType: "print_exports",
        targetEntityId: exportId,
        metadata: { restaurant_id: restaurantId },
      });
      return jsonResponse({
        exportId: approved.id,
        status: approved.status,
        preflight: approved.preflight,
        previewUrl: await signedUrl(adminClient, approved.production_storage_path),
      }, 200, cors);
    }

    if (action !== "create") throw new HttpError(400, "Action impression invalide");
    const providerProductId = requireUuid(body.providerProductId, "providerProductId");
    let documentPayload = asRecord(body.document);
    if (hasArtworkOverlays(documentPayload)) throw new HttpError(422, "PRINT_NATIVE_ARTWORK_ONLY");

    const { data: providerProduct, error: providerError } = await adminClient
      .from("print_provider_products")
      .select("id, print_product_id, provider, provider_reference, width_mm, height_mm, bleed_mm, safe_margin_mm, print_technology, printable_sides, orientation, minimum_quantity, quantity_step, options, specifications, print_products!inner(category, active)")
      .eq("id", providerProductId)
      .eq("active", true)
      .eq("print_products.active", true)
      .not("print_product_id", "is", null)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!providerProduct) throw new HttpError(404, "Variante d’impression indisponible");
    if (!isSinglePagePrintProduct(providerProduct, providerProduct.print_products as any) || !isNativeArtworkProduct(providerProduct, providerProduct.print_products as any)) {
      throw new HttpError(409, "Ce support exige un gabarit spécial, plusieurs faces ou un procédé non pris en charge par le visuel natif");
    }

    let template: ReturnType<typeof buildNativePrintTemplate>;
    try {
      template = buildNativePrintTemplate({ widthMm: providerProduct.width_mm, heightMm: providerProduct.height_mm,
        bleedMm: providerProduct.bleed_mm, safeMarginMm: providerProduct.safe_margin_mm });
    } catch { throw new HttpError(409, "Spécifications fournisseur incomplètes ou incompatibles avec un visuel natif"); }
    const spec = {
      widthMm: numberOr(providerProduct.width_mm, 0),
      heightMm: numberOr(providerProduct.height_mm, 0),
      bleedMm: Math.max(0, numberOr(providerProduct.bleed_mm, 0)),
      safeMarginMm: template.safeMarginMm,
      minimumDpi: template.minimumDpi, recommendedDpi: template.recommendedDpi,
      printTechnology: typeof providerProduct.print_technology === "string" ? providerProduct.print_technology : null,
    };
    if (!(spec.widthMm > 0 && spec.heightMm > 0)) throw new HttpError(409, "Spécifications fournisseur incomplètes");

    const sourceGenerationId = requireUuid(documentPayload.sourceGenerationId, "sourceGenerationId");
    const { data: source, error: sourceError } = await adminClient.from("ai_generated_assets")
      .select("metadata, storage_bucket, storage_path, title").eq("id", sourceGenerationId).eq("restaurant_id", restaurantId)
      .eq("status", "stored").maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || !matchesGeneratedPrintFormat(asRecord(source.metadata).marketing_output_target, {
      providerProductId, widthMm: spec.widthMm, heightMm: spec.heightMm, bleedMm: spec.bleedMm,
    })) throw new HttpError(409, "Le support doit correspondre au format enregistré lors de la génération du visuel");

    const savedFormat = asRecord(asRecord(source.metadata).marketing_output_target);
    if (!nativePrintContractMatches(savedFormat, template) || !/^[a-f0-9]{64}$/.test(String(savedFormat.sourceSha256 || ""))) {
      throw new HttpError(409, "Cette création précède le gabarit natif actuel. Régénérez-la avec le support sélectionné.");
    }
    const bucket = String(source.storage_bucket || "");
    const sourcePath = String(source.storage_path || "");
    if (!/^[a-zA-Z0-9_-]+$/.test(bucket) || !sourcePath.startsWith(`ai-generated/${restaurantId}/`) || sourcePath.includes("..")) {
      throw new HttpError(409, "Original natif d’impression indisponible");
    }
    // Ignore browser URL/dimensions. Sign only the original asset owned by this restaurant.
    const { data: original, error: signingError } = await adminClient.storage.from(bucket).createSignedUrl(sourcePath, 120);
    if (signingError || !original?.signedUrl) throw new HttpError(503, "Original natif d’impression indisponible");
    documentPayload = { version: 1, sourceGenerationId, title: String(source.title || "Création Marketing Studio").slice(0, 160),
      background: { url: original.signedUrl, mimeType: "image/png", widthPx: template.widthPx, heightPx: template.heightPx },
      texts: [], qr: null, logo: null, layout: { backgroundPosition: "contain", overlayOpacity: 0 } };
    const limiter = createRateLimiter(adminClient, "print-export");
    await limiter.consume(`user:${actor.userId}`, { maxRequests: 5, windowSeconds: 600 });
    await limiter.consume(`restaurant:${restaurantId}`, { maxRequests: 10, windowSeconds: 600 });
    const built = await buildPrintPdf({ document: documentPayload, spec, expectedSourceSha256: String(savedFormat.sourceSha256) });
    const documentId = crypto.randomUUID();
    const exportId = crypto.randomUUID();
    const path = `${restaurantId}/${documentId}/${exportId}/production.pdf`;

    const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, built.bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw new HttpError(503, "Impossible de stocker le PDF d’impression");

    let documentInserted = false;
    try {
      const { error: documentError } = await adminClient.from("print_documents").insert({
        id: documentId,
        restaurant_id: restaurantId,
        created_by: actor.userId,
        source_generation_id: typeof documentPayload.sourceGenerationId === "string" ? documentPayload.sourceGenerationId.slice(0, 200) : null,
        title: String(documentPayload.title || "Création Marketing Studio").slice(0, 160),
        version: 1,
        status: "ready",
        document: { ...documentPayload, background: { ...asRecord(documentPayload.background), url: null,
          storageBucket: bucket, storagePath: sourcePath } },
      });
      if (documentError) throw documentError;
      documentInserted = true;

      const { error: exportError } = await adminClient.from("print_exports").insert({
        id: exportId,
        restaurant_id: restaurantId,
        print_document_id: documentId,
        provider_product_id: providerProductId,
        export_version: 1,
        status: "ready",
        proof_storage_path: path,
        production_storage_path: path,
        preview_storage_path: null,
        mime_type: "application/pdf",
        byte_size: built.bytes.byteLength,
        md5: built.md5,
        sha256: built.sha256,
        preflight: built.preflight,
        product_spec_snapshot: {
          provider: providerProduct.provider,
          providerReference: providerProduct.provider_reference,
          printableSides: providerProduct.printable_sides,
          orientation: providerProduct.orientation,
          minimumQuantity: providerProduct.minimum_quantity,
          quantityStep: providerProduct.quantity_step,
          options: providerProduct.options,
          specifications: providerProduct.specifications,
          ...built.productSpecSnapshot,
        },
      });
      if (exportError) throw exportError;
    } catch (error) {
      await bestEffortRollback(adminClient, path, documentId, documentInserted);
      throw error;
    }

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-export",
      action: "create_export",
      status: "success",
      targetEntityType: "print_exports",
      targetEntityId: exportId,
      metadata: { restaurant_id: restaurantId, provider: providerProduct.provider },
    });

    return jsonResponse({
      exportId,
      status: "ready",
      preflight: built.preflight,
      previewUrl: await signedUrl(adminClient, path),
    }, 201, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur export impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-export",
      action: "export",
      status: "failure",
      targetEntityType: "print_exports",
      errorMessage: message,
    });
    const preflight = error instanceof HttpError && error.details?.preflight;
    // Return only actionable issue codes/messages. Never expose raw vision observations
    // or image content in a failed print-export response.
    const blocking = status === 422 && preflight && typeof preflight === "object"
      ? (preflight as { blocking?: unknown }).blocking : null;
    const issues = Array.isArray(blocking) ? blocking
      .filter(item => item && typeof item === "object" && typeof item.code === "string" && typeof item.message === "string")
      .slice(0, 5).map(item => ({ code: String(item.code).slice(0, 80), message: String(item.message).slice(0, 250) })) : [];
    return jsonResponse({ error: status >= 500 ? "Erreur interne de préparation impression" : message,
      ...(issues.length ? { issues } : {}) }, status, cors);
  }
});
