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
      if (pf.ready !== true) throw new HttpError(409, "Le préflight doit être valide avant approbation");

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
    const documentPayload = asRecord(body.document);

    const { data: providerProduct, error: providerError } = await adminClient
      .from("print_provider_products")
      .select("id, print_product_id, provider, provider_reference, width_mm, height_mm, bleed_mm, safe_margin_mm, print_technology, printable_sides, orientation, minimum_quantity, quantity_step, options, specifications")
      .eq("id", providerProductId)
      .eq("active", true)
      .not("print_product_id", "is", null)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!providerProduct) throw new HttpError(404, "Variante d’impression indisponible");

    const spec = {
      widthMm: numberOr(providerProduct.width_mm, 0),
      heightMm: numberOr(providerProduct.height_mm, 0),
      bleedMm: Math.max(0, numberOr(providerProduct.bleed_mm, 0)),
      safeMarginMm: Math.max(0, numberOr(providerProduct.safe_margin_mm, 3)),
      printTechnology: typeof providerProduct.print_technology === "string" ? providerProduct.print_technology : null,
    };
    if (!(spec.widthMm > 0 && spec.heightMm > 0)) throw new HttpError(409, "Spécifications fournisseur incomplètes");

    const built = await buildPrintPdf({ document: documentPayload, spec });
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
        document: documentPayload,
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
    return jsonResponse({ error: status >= 500 ? "Erreur interne de préparation impression" : message }, status, cors);
  }
});