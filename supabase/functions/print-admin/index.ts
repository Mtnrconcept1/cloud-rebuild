import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { CloudprinterError, getPrintProvider } from "../_shared/print/cloudprinter.ts";

const REORDER_CAUSES = new Set([
  "reorder_shipping_item_not_received",
  "reorder_shipping_item_damaged",
  "reorder_item_missing",
  "reorder_wrong_item",
  "reorder_wrong_quantity",
  "reorder_wrong_paper_or_material",
  "reorder_wrong_finishing_size",
  "reorder_wrong_color_mode",
  "reorder_wrong_print_position",
  "reorder_print_quality",
]);

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function requireString(value: unknown, field: string, max = 500) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max) throw new HttpError(400, `${field} invalide`);
  return normalized;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function getOrderBundle(adminClient: any, orderId: string) {
  const { data: order, error } = await adminClient
    .from("print_orders")
    .select("id, restaurant_id, owner_user_id, print_quote_id, print_export_id, status, payment_status, provider_reference, shipping_address")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new HttpError(404, "Commande impression introuvable");

  const [itemResult, quoteResult, exportResult] = await Promise.all([
    adminClient
      .from("print_order_items")
      .select("id, item_reference, quantity, provider_product_reference, options, file_snapshot")
      .eq("print_order_id", order.id)
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("print_quotes")
      .select("id, selected_shipping_level, selected_shipping_option")
      .eq("id", order.print_quote_id)
      .single(),
    adminClient
      .from("print_exports")
      .select("id, production_storage_path, md5, sha256, status")
      .eq("id", order.print_export_id)
      .single(),
  ]);

  if (itemResult.error) throw itemResult.error;
  if (quoteResult.error) throw quoteResult.error;
  if (exportResult.error) throw exportResult.error;
  if (!itemResult.data || !quoteResult.data || !exportResult.data) {
    throw new HttpError(409, "Données impression incomplètes");
  }
  return { order, item: itemResult.data, quote: quoteResult.data, exportRow: exportResult.data };
}

function normalizeCoreState(value: string | null) {
  const code = Number(value);
  if (code === 500) return "canceled";
  if (code === 100) return "shipped";
  if (code === 501) return "produced";
  if ([7, 11, 31, 35, 39, 41].includes(code)) return "production_error";
  if (code >= 10 && code <= 45) return "producing";
  if (code === 6) return "validated";
  if (code === 1 || code === 5) return "submitted";
  return null;
}

async function reconcileOne(adminClient: any, orderId: string) {
  const { order } = await getOrderBundle(adminClient, orderId);
  if (!order.provider_reference) throw new HttpError(409, "Référence fournisseur indisponible");
  const info = await getPrintProvider().getOrder(order.provider_reference);
  if (!info) return { orderId, found: false };
  const state = normalizeCoreState(info.stateCode || info.state);
  const tracking = info.items.find((entry) => entry.tracking)?.tracking || null;
  if (state) {
    const { error } = await adminClient.rpc("advance_print_order_state", {
      p_order_id: order.id,
      p_state: state,
      p_provider_state: info.stateCode || info.state,
      p_tracking_code: tracking,
      p_tracking_url: null,
      p_carrier: null,
      p_provider_event_id: null,
      p_message: "Réconciliation admin",
      p_metadata: { manual: true, monotonic: true },
    });
    if (error) throw error;
  }
  return { orderId, found: true, state: state || "provider_state_only" };
}

async function submitReorder(adminClient: any, actor: any, orderId: string, cause: string, description: string) {
  const { order, item, quote, exportRow } = await getOrderBundle(adminClient, orderId);
  if (!order.provider_reference) throw new HttpError(409, "Commande fournisseur d’origine indisponible");
  if (!item.item_reference || !exportRow.production_storage_path) throw new HttpError(409, "Fichier d’origine indisponible");

  const reorderId = crypto.randomUUID();
  const providerReference = `TOKR_${reorderId.replace(/-/g, "").toUpperCase()}`;
  const { error: insertError } = await adminClient.from("print_reorders").insert({
    id: reorderId,
    print_order_id: order.id,
    restaurant_id: order.restaurant_id,
    original_item_id: item.id,
    requested_by: actor.userId,
    approved_by: actor.userId,
    provider: "cloudprinter",
    provider_reference: providerReference,
    reorder_cause: cause,
    reorder_description: description,
    status: "submission_pending",
    approved_at: new Date().toISOString(),
    metadata: {
      original_provider_reference: order.provider_reference,
      original_item_reference: item.item_reference,
    },
  });
  if (insertError) throw insertError;

  const { data: signed, error: signedError } = await adminClient.storage
    .from("print-production-files")
    .createSignedUrl(exportRow.production_storage_path, 24 * 60 * 60);
  if (signedError || !signed?.signedUrl) throw new HttpError(503, "URL de production indisponible");

  const provider = getPrintProvider();
  try {
    const existing = await provider.getOrder(providerReference);
    if (!existing) {
      await provider.reorder({
        reference: providerReference,
        email: Deno.env.get("PRINT_SUPPORT_EMAIL")?.trim() || "support@thetok.ch",
        address: asRecord(order.shipping_address) as any,
        items: [{
          reference: `R_${item.item_reference}`.slice(0, 120),
          product: item.provider_product_reference,
          count: item.quantity,
          shipping_level: quote.selected_shipping_level || "ground",
          options: Array.isArray(item.options) ? item.options : [],
          files: [{ type: "product", url: signed.signedUrl, md5sum: exportRow.md5 }],
          reorder_cause: cause,
          reorder_desc: description,
          reorder_order_reference: order.provider_reference,
          reorder_item_reference: item.item_reference,
        }],
      });
    }
    const { error: stateError } = await adminClient.rpc("advance_print_reorder_state", {
      p_reorder_id: reorderId,
      p_state: "submitted",
      p_provider_order_id: null,
      p_provider_item_id: null,
      p_tracking_code: null,
      p_tracking_url: null,
      p_carrier: null,
    });
    if (stateError) throw stateError;
  } catch (error) {
    const retryable = error instanceof CloudprinterError && error.retryable;
    await adminClient
      .from("print_reorders")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
        metadata: {
          error: error instanceof Error ? error.message.slice(0, 300) : "provider_error",
          retryable,
        },
      })
      .eq("id", reorderId);
    throw error;
  }

  return { reorderId, providerReference };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  const adminClient = createAdminClient();

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["admin"]);
    await assertProductionFlowAllowed(actor, "administration impression");
    const body = asRecord(await req.json().catch(() => ({})));
    const action = String(body.action || "list").trim().toLowerCase();

    if (action === "list") {
      const page = clampInteger(body.page, 1, 1, 10_000);
      const pageSize = clampInteger(body.pageSize, 25, 1, 100);
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      let query = adminClient.from("print_orders").select(
        "id, restaurant_id, owner_user_id, print_quote_id, print_export_id, payment_attempt_id, status, payment_status, provider_reference, provider_order_id, customer_currency, customer_amount_cents, quantity, tracking_code, tracking_url, carrier, created_at, updated_at",
      );
      const status = String(body.status || "").trim();
      const restaurantId = String(body.restaurantId || "").trim();
      if (status) query = query.eq("status", status);
      if (restaurantId) query = query.eq("restaurant_id", restaurantId);
      const { data, error } = await query.order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      const rows = data || [];
      const quoteIds = rows.map((row: any) => row.print_quote_id).filter(Boolean);
      const { data: quotes, error: quotesError } = quoteIds.length
        ? await adminClient
          .from("print_quotes")
          .select("id, provider_currency, provider_product_amount, provider_product_vat, selected_shipping_amount, selected_shipping_vat, margin_cents, margin_bps, expires_at")
          .in("id", quoteIds)
        : { data: [], error: null };
      if (quotesError) throw quotesError;
      const quoteMap = new Map((quotes || []).map((quote: any) => [quote.id, quote]));
      return jsonResponse({
        orders: rows.slice(0, pageSize).map((row: any) => ({
          ...row,
          provider_cost: quoteMap.get(row.print_quote_id) || null,
        })),
        pagination: { page, pageSize, hasMore: rows.length > pageSize },
      }, 200, cors);
    }

    if (action === "settings") {
      const { data, error } = await adminClient.from("print_settings").select("*").eq("id", "global").single();
      if (error) throw error;
      return jsonResponse({ settings: data }, 200, cors);
    }

    if (action === "update_settings") {
      const patch: RecordValue = { updated_at: new Date().toISOString() };
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (typeof body.newOrdersEnabled === "boolean") patch.new_orders_enabled = body.newOrdersEnabled;
      if (body.defaultMarginBps !== undefined) patch.default_margin_bps = clampInteger(body.defaultMarginBps, 2500, 0, 50_000);
      if (body.minimumMarginCents !== undefined) patch.minimum_margin_cents = clampInteger(body.minimumMarginCents, 500, 0, 1_000_000);
      if (body.roundingIncrementCents !== undefined) patch.rounding_increment_cents = clampInteger(body.roundingIncrementCents, 10, 1, 1000);
      const { data, error } = await adminClient.from("print_settings").update(patch).eq("id", "global").select("*").single();
      if (error) throw error;
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-admin",
        action: "update_settings",
        status: "success",
        targetEntityType: "print_settings",
        targetEntityId: "global",
        metadata: patch,
      });
      return jsonResponse({ settings: data }, 200, cors);
    }

    if (action === "map_product") {
      const providerProductId = requireString(body.providerProductId, "providerProductId", 80);
      const printProductId = requireString(body.printProductId, "printProductId", 80);
      const { data: providerRow, error: providerRowError } = await adminClient
        .from("print_provider_products")
        .select("id, provider_reference")
        .eq("id", providerProductId)
        .maybeSingle();
      if (providerRowError) throw providerRowError;
      if (!providerRow) throw new HttpError(404, "Produit fournisseur introuvable");
      const { data: logicalProduct, error: logicalError } = await adminClient
        .from("print_products")
        .select("id")
        .eq("id", printProductId)
        .eq("active", true)
        .maybeSingle();
      if (logicalError) throw logicalError;
      if (!logicalProduct) throw new HttpError(404, "Produit TheTok introuvable");

      const details = await getPrintProvider().getProduct(providerRow.provider_reference);
      const { data, error } = await adminClient
        .from("print_provider_products")
        .update({
          print_product_id: printProductId,
          active: body.active !== false,
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
        })
        .eq("id", providerProductId)
        .select("id")
        .single();
      if (error) throw error;
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-admin",
        action: "map_product",
        status: "success",
        targetEntityType: "print_provider_products",
        targetEntityId: data.id,
        metadata: { print_product_id: printProductId },
      });
      return jsonResponse({ ok: true, id: data.id }, 200, cors);
    }

    const orderId = requireString(body.orderId, "orderId", 80);
    if (action === "reconcile") {
      const result = await reconcileOne(adminClient, orderId);
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-admin",
        action: "reconcile",
        status: "success",
        targetEntityType: "print_orders",
        targetEntityId: orderId,
      });
      return jsonResponse({ ok: true, result }, 200, cors);
    }

    if (action === "cancel") {
      const { order } = await getOrderBundle(adminClient, orderId);
      if (!order.provider_reference) throw new HttpError(409, "Référence fournisseur indisponible");
      const result = await getPrintProvider().cancelOrder(order.provider_reference);
      if (!result.accepted) throw new HttpError(409, "Annulation fournisseur refusée");
      const { error } = await adminClient.rpc("advance_print_order_state", {
        p_order_id: order.id,
        p_state: "cancellation_requested",
        p_provider_state: "cancel_requested",
        p_tracking_code: null,
        p_tracking_url: null,
        p_carrier: null,
        p_provider_event_id: null,
        p_message: "Annulation demandée par un administrateur",
        p_metadata: { admin_user_id: actor.userId },
      });
      if (error) throw error;
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-admin",
        action: "cancel",
        status: "success",
        targetEntityType: "print_orders",
        targetEntityId: orderId,
      });
      return jsonResponse({ ok: true, status: "cancellation_requested" }, 200, cors);
    }

    if (action === "reorder") {
      const cause = requireString(body.cause, "cause", 120);
      if (!REORDER_CAUSES.has(cause)) throw new HttpError(400, "Cause de réimpression Cloudprinter invalide");
      const description = requireString(body.description || cause, "description", 1000);
      const result = await submitReorder(adminClient, actor, orderId, cause, description);
      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "print-admin",
        action: "reorder",
        status: "success",
        targetEntityType: "print_reorders",
        targetEntityId: result.reorderId,
        metadata: { print_order_id: orderId, cause },
      });
      return jsonResponse({ ok: true, ...result, status: "submitted" }, 201, cors);
    }

    throw new HttpError(400, "Action admin impression invalide");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur admin impression";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "print-admin",
      action: "admin",
      status: "failure",
      targetEntityType: "print_orders",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne administration impression" : message }, status, cors);
  }
});
