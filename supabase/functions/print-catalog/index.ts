import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { CloudprinterError, getPrintProvider } from "../_shared/print/cloudprinter.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** PostgREST puts `in` filters and upserts in one request, so both are chunked. */
const CATALOG_BATCH_SIZE = 100;

function chunk<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) batches.push(rows.slice(index, index + size));
  return batches;
}

/**
 * Operator-facing reason a provider call failed.
 *
 * A disabled or unconfigured Cloudprinter mode is an admin action, not an
 * internal fault, and hiding it behind "Erreur interne" is what made the empty
 * catalogue impossible to diagnose from the audit log. These codes carry no
 * credentials and no request payload.
 */
function providerDiagnostics(error: unknown): Record<string, unknown> | null {
  if (error instanceof CloudprinterError) {
    return {
      code: error.code,
      ...(error.status ? { providerStatus: error.status } : {}),
      ...(error.transportCode ? { transportCode: error.transportCode } : {}),
    };
  }
  if (error instanceof HttpError && /^CLOUDPRINTER_[A-Z_]+$/.test(error.message)) {
    return { code: error.message };
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    const body = asRecord(await req.json().catch(() => ({})));
    const action = String(body.action || "list").trim().toLowerCase();

    if (action === "list") {
      requireRole(actor, ["restaurateur", "admin"]);
      const restaurantId = String(body.restaurantId || "").trim();
      if (!restaurantId) throw new HttpError(400, "restaurantId requis");
      await requireRestaurantAccess(actor, restaurantId);

      const { data: products, error: productError } = await adminClient
        .from("print_products")
        .select("id, slug, display_name, category, description, default_width_mm, default_height_mm, default_orientation, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (productError) throw productError;

      const productIds = (products || []).map((product: any) => product.id);
      const { data: variants, error: variantError } = productIds.length
        ? await adminClient
          .from("print_provider_products")
          .select("id, print_product_id, provider_reference, width_mm, height_mm, bleed_mm, safe_margin_mm, printable_sides, orientation, print_technology, minimum_quantity, quantity_step, options")
          .in("print_product_id", productIds)
          .eq("active", true)
          .order("provider_reference", { ascending: true })
        : { data: [], error: null };
      if (variantError) throw variantError;

      const byProduct = new Map<string, any[]>();
      for (const variant of variants || []) {
        const rows = byProduct.get(variant.print_product_id) || [];
        rows.push({
          productId: variant.print_product_id,
          providerProductId: variant.id,
          providerReference: variant.provider_reference,
          displayName: (products || []).find((product: any) => product.id === variant.print_product_id)?.display_name || variant.provider_reference,
          widthMm: toNumber(variant.width_mm),
          heightMm: toNumber(variant.height_mm),
          bleedMm: Math.max(0, toNumber(variant.bleed_mm)),
          safeMarginMm: Math.max(0, toNumber(variant.safe_margin_mm, 3)),
          printableSides: Math.max(1, Math.round(toNumber(variant.printable_sides, 1))),
          orientation: variant.orientation,
          printTechnology: variant.print_technology,
          minimumQuantity: Math.max(1, Math.round(toNumber(variant.minimum_quantity, 1))),
          quantityStep: Math.max(1, Math.round(toNumber(variant.quantity_step, 1))),
          options: Array.isArray(variant.options) ? variant.options : [],
        });
        byProduct.set(variant.print_product_id, rows);
      }

      return jsonResponse({
        products: (products || []).map((product: any) => ({
          id: product.id,
          slug: product.slug,
          displayName: product.display_name,
          category: product.category,
          description: product.description,
          variants: byProduct.get(product.id) || [],
        })).filter((product: any) => product.variants.length > 0),
      }, 200, cors);
    }

    requireRole(actor, ["admin"]);

    if (action === "admin_mappings") {
      const [{ data: mappings, error: mappingError }, { data: products, error: productError }] = await Promise.all([
        adminClient
          .from("print_provider_products")
          .select("id, provider_reference, provider_name, print_product_id, active, width_mm, height_mm, synced_at")
          .eq("provider", "cloudprinter")
          .order("provider_name", { ascending: true })
          .limit(500),
        adminClient
          .from("print_products")
          .select("id, display_name, slug")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (mappingError) throw mappingError;
      if (productError) throw productError;
      return jsonResponse({ mappings: mappings || [], logicalProducts: products || [] }, 200, cors);
    }

    const provider = getPrintProvider();

    if (action === "sync") {
      const remoteProducts = await provider.getProducts();
      const references = remoteProducts.map((product) => product.reference);

      // Cloudprinter returns hundreds of references: a single `in` filter would
      // overflow the request line and a per-product upsert would exhaust the
      // function's wall clock before the catalogue is written.
      const existingRows: any[] = [];
      for (const batch of chunk(references, CATALOG_BATCH_SIZE)) {
        const { data, error: existingError } = await adminClient
          .from("print_provider_products")
          .select("id, provider_reference, print_product_id, active")
          .eq("provider", "cloudprinter")
          .in("provider_reference", batch);
        if (existingError) throw existingError;
        existingRows.push(...(data || []));
      }
      const existing = new Map(existingRows.map((row: any) => [row.provider_reference, row]));

      const syncedAt = new Date().toISOString();
      const upsertRows = remoteProducts.map((remote) => {
        const current = existing.get(remote.reference) as any;
        return {
          provider: "cloudprinter",
          provider_reference: remote.reference,
          provider_name: remote.name,
          provider_note: remote.description,
          // An admin mapping and its activation are never reset by a resync.
          print_product_id: current?.print_product_id || null,
          active: current?.active === true,
          raw_snapshot: remote.raw,
          synced_at: syncedAt,
          updated_at: syncedAt,
        };
      });
      for (const batch of chunk(upsertRows, CATALOG_BATCH_SIZE)) {
        const { error: upsertError } = await adminClient
          .from("print_provider_products")
          .upsert(batch, { onConflict: "provider,provider_reference" });
        if (upsertError) throw upsertError;
      }

      // Hydrate detailed specs only for mappings explicitly selected by an admin.
      const mapped = existingRows.filter((row: any) => row.print_product_id);
      let hydrated = 0;
      for (const row of mapped.slice(0, 50)) {
        const details = await provider.getProduct(row.provider_reference);
        const { error } = await adminClient.from("print_provider_products").update({
          provider_name: details.name,
          provider_note: details.description,
          width_mm: details.widthMm,
          height_mm: details.heightMm,
          bleed_mm: details.bleedMm,
          safe_margin_mm: details.safeMarginMm,
          printable_sides: details.printableSides,
          orientation: details.orientation,
          print_technology: details.printTechnology,
          minimum_quantity: details.minimumQuantity,
          quantity_step: details.quantityStep,
          options: details.options,
          specifications: details.specifications,
          raw_snapshot: details.raw,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (error) throw error;
        hydrated += 1;
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-catalog",
        action: "sync_cloudprinter",
        status: "success",
        targetEntityType: "print_provider_products",
        metadata: { discovered: remoteProducts.length, hydrated },
      });
      return jsonResponse({ ok: true, discovered: remoteProducts.length, hydrated }, 200, cors);
    }

    if (action === "hydrate") {
      const reference = String(body.reference || "").trim();
      if (!reference) throw new HttpError(400, "reference requise");
      const details = await provider.getProduct(reference);
      const { data, error } = await adminClient.from("print_provider_products").update({
        provider_name: details.name,
        provider_note: details.description,
        width_mm: details.widthMm,
        height_mm: details.heightMm,
        bleed_mm: details.bleedMm,
        safe_margin_mm: details.safeMarginMm,
        printable_sides: details.printableSides,
        orientation: details.orientation,
        print_technology: details.printTechnology,
        minimum_quantity: details.minimumQuantity,
        quantity_step: details.quantityStep,
        options: details.options,
        specifications: details.specifications,
        raw_snapshot: details.raw,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("provider", "cloudprinter").eq("provider_reference", reference).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Produit fournisseur non synchronisé");
      return jsonResponse({ ok: true, id: data.id }, 200, cors);
    }

    throw new HttpError(400, "Action catalogue impression invalide");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur catalogue impression";
    const diagnostics = providerDiagnostics(error);
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-catalog",
      action: "catalog",
      status: "failure",
      targetEntityType: "print_provider_products",
      errorMessage: message,
      ...(diagnostics ? { metadata: { provider_error: diagnostics } } : {}),
    });
    return jsonResponse({
      error: status >= 500 && !diagnostics ? "Erreur interne catalogue impression" : message,
      ...(diagnostics ? { providerError: diagnostics } : {}),
    }, status, cors);
  }
});
