import type { RequestActor } from "./auth.ts";
type Row = Record<string, unknown>;
const uuid = { type: "string", format: "uuid" };
const time = { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" };
const date = { type: "string", format: "date" };
const fields = { menu_item_id: uuid, description: { type: "string", maxLength: 4000 }, discounted_price_chf: { type: "number", minimum: 0.01, maximum: 10000 }, quantity_available: { type: "integer", minimum: 0, maximum: 100000 }, is_active: { type: "boolean" } };
const confirm = { reason: { type: "string", minLength: 6, maxLength: 1000 }, confirmed_by_user: { type: "boolean", const: true }, idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" } };
export const TOK_SPECIAL_OFFER_TOOLS = (["anti_waste", "flash_sale"] as const).flatMap((kind) => {
  const specific = kind === "anti_waste" ? { offer_type: { type: "string", enum: ["regular", "surprise_bag", "solidarity"] }, available_date: date, pickup_start: time, pickup_end: time } : { sale_date: date, sale_start: time, sale_end: time, delivery_available: { type: "boolean" }, takeaway_available: { type: "boolean" } };
  return (["list", "create", "set_status", "archive"] as const).map((action) => {
    const write = action !== "list";
    const properties: Row = { restaurant_id: uuid, ...(action === "list" ? { limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0, maximum: 10000 } } : action === "create" ? { ...fields, ...specific } : { offer_id: uuid, ...(action === "set_status" ? { is_active: { type: "boolean" } } : {}) }), ...(write ? confirm : {}) };
    return { name: `tok_${action}_restaurant_${kind}`, description: action === "list" ? `Consulter les offres ${kind} de mon restaurant, y compris archivées. Les clients peuvent consulter et commander les offres via les outils dédiés, sous réserve de disponibilité.` : action === "create" ? `Créer une offre ${kind} à partir d'un plat de mon restaurant. Nom et prix de référence sont lus dans TOK; prix remisé, stock, dates et motif explicites. Mutation native auditée, aucun achat client.` : `${action === "archive" ? "Archiver" : "Activer ou désactiver"} une offre ${kind} de mon restaurant via le RPC natif audité. Les contraintes de stock, dates et archivage restent applicables.`, inputSchema: { type: "object", properties, required: ["restaurant_id", ...(action === "create" ? ["menu_item_id", "discounted_price_chf", "quantity_available", "is_active", ...Object.keys(specific)] : action === "list" ? [] : ["offer_id", ...(action === "set_status" ? ["is_active"] : [])]), ...(write ? Object.keys(confirm) : [])], additionalProperties: false }, annotations: { readOnlyHint: !write, destructiveHint: write, idempotentHint: true, openWorldHint: false } };
  });
});
export const TOK_SPECIAL_OFFER_NAMES = new Set(TOK_SPECIAL_OFFER_TOOLS.map((tool) => tool.name));

/** Called only after the role router verifies caller identity, ownership and restaurant MCP opt-in. */
export async function invokeTokSpecialOfferOperation(name: string, args: Row, context: {
  read: (query: PromiseLike<{ data: unknown; error: unknown }>) => Promise<unknown>;
  client: NonNullable<RequestActor["userClient"]>;
  mutate: (name: string, args: Row, run: () => Promise<{ statusCode: number; payload: Row }>) => Promise<{ statusCode: number; payload: Row }>;
  fail: (status: number, message: string) => never;
}) {
  const { read, client, mutate, fail } = context;
  const anti = name.endsWith("anti_waste"), table = anti ? "anti_waste_offers" : "flash_sales";
  const id = String(args.restaurant_id), create = name.startsWith("tok_create_"), list = name.startsWith("tok_list_");
  const select = `id,restaurant_id,title,description,original_price,discounted_price,quantity_available,is_active,archived_at,${anti ? "offer_type,available_date,pickup_start,pickup_end" : "sale_date,sale_start,sale_end,delivery_available,takeaway_available"}`;
  const ok = (data: Row) => ({ statusCode: 200, payload: { ok: true, ...data } });
  if (list) { const limit = Number(args.limit || 20), offset = Number(args.offset || 0); return ok({ items: await read(client.from(table).select(select).eq("restaurant_id", id).order("created_at", { ascending: false }).order("id").range(offset, offset + limit - 1)), limit, offset }); }
  if (String(args.reason).trim().length < 6) return fail(400, "tok_connect_special_offer_reason_invalid");
  if (create) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (String(args[anti ? "available_date" : "sale_date"]) < today) return fail(400, "tok_connect_special_offer_date_invalid");
    const price = Number(args.discounted_price_chf);
    if (Math.abs(price * 100 - Math.round(price * 100)) > 0.000001 || (args.is_active && !args.quantity_available)) return fail(400, "tok_connect_special_offer_price_stock_invalid");
    const start = String(args[anti ? "pickup_start" : "sale_start"]), end = String(args[anti ? "pickup_end" : "sale_end"]);
    if (end <= start || (!anti && !args.delivery_available && !args.takeaway_available)) return fail(400, "tok_connect_special_offer_window_invalid");
  }
  return mutate(name, args, async () => {
    let rpcArgs: Row = { [anti ? "p_offer_id" : "p_sale_id"]: create ? null : args.offer_id, p_reason: String(args.reason).trim() };
    let rpcName: string;
    // Deterministic validation failures must complete the acquired idempotency key.
    const rejected = (statusCode: number, error: string) => ({ statusCode, payload: { ok: false, error } });
    try {
    if (create) {
      const item = await read(client.from("menu_items").select("id,name,price").eq("id", args.menu_item_id).eq("restaurant_id", id).maybeSingle()) as Row | null;
      if (!item) return rejected(404, "tok_connect_restaurant_entity_not_found");
      const original = Number(item.price);
      if (!Number.isFinite(original) || original <= 0 || Number(args.discounted_price_chf) > original) return rejected(400, "tok_connect_special_offer_price_stock_invalid");
      const keys = anti ? ["offer_type", "available_date", "pickup_start", "pickup_end"] : ["sale_date", "sale_start", "sale_end", "delivery_available", "takeaway_available"];
      rpcArgs = { ...rpcArgs, p_payload: { restaurant_id: id, title: item.name, description: args.description || null, original_price: original, discounted_price: args.discounted_price_chf, quantity_available: args.quantity_available, is_active: args.is_active, ...Object.fromEntries(keys.map((key) => [key, args[key]])) } };
      rpcName = anti ? "restaurant_upsert_anti_waste_offer" : "restaurant_upsert_flash_sale";
    } else {
      const offer = await read(client.from(table).select("id").eq("id", args.offer_id).eq("restaurant_id", id).maybeSingle());
      if (!offer) return rejected(404, "tok_connect_restaurant_entity_not_found");
      const status = name.startsWith("tok_set_status_");
      rpcName = `restaurant_${status ? "update" : "archive"}_${anti ? "anti_waste_offer" : "flash_sale"}${status ? "_status" : ""}`;
      if (status) rpcArgs.p_is_active = args.is_active;
    }
    } catch {
      return rejected(503, "tok_connect_special_offer_validation_unavailable");
    }
    const { data, error } = await client.rpc(rpcName, rpcArgs);
    if (error) {
      const business = ["P0001", "23514", "23505", "23503", "42501"].includes(String(error.code || ""));
      return { statusCode: business ? 409 : 503, payload: { ok: false, error: business ? "tok_connect_special_offer_native_rejected" : "tok_connect_special_offer_native_unavailable" } };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    if (!row || row.restaurant_id !== id) return fail(503, "tok_connect_special_offer_reconciliation_required");
    return ok({ item: Object.fromEntries(select.split(",").map((key) => [key, row[key]])) });
  });
}
