import type { RequestActor } from "./auth.ts";
type Row = Record<string, unknown>;
type Result = { statusCode: number; payload: Row };
const uuid = { type: "string", format: "uuid" };
const context = { restaurant_id: uuid, branch_id: uuid };
const geometry = { shape: { type: "string", enum: ["round", "rect"] }, x: { type: "number", minimum: 0, maximum: 1040 }, y: { type: "number", minimum: 0, maximum: 760 } };
const table = { table_number: { type: "string", minLength: 1, maxLength: 40 }, sector: { type: "string", minLength: 1, maxLength: 60 }, capacity: { type: "integer", minimum: 1, maximum: 30 }, is_active: { type: "boolean" }, ...geometry };
function tool(action: string, description: string, fields: Row, required: string[], write = true) {
  const confirmation = { confirmed_by_user: { type: "boolean", const: true }, idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" }, reason: { type: "string", minLength: 6, maxLength: 1000 } };
  return { name: `tok_${action}_restaurant_floor_plan`, description, inputSchema: { type: "object", properties: { ...context, ...fields, ...(write ? confirmation : {}) }, required: ["restaurant_id", "branch_id", ...required, ...(write ? Object.keys(confirmation) : [])], additionalProperties: false }, annotations: { readOnlyHint: !write, destructiveHint: write, idempotentHint: true, openWorldHint: false } };
}
export const TOK_FLOORPLAN_OPERATION_TOOLS = [
  tool("get", "Lire le modèle de tables et les positions spécifiques à une date dans ma succursale TOK. Les affectations sont paginées et limitées aux réservations de cette date. Ne modifie aucune réservation.", { service_date: { type: "string", format: "date" }, limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0, maximum: 10000 } }, ["service_date"], false),
  tool("add_table", "Créer une table dans ma succursale via le RPC natif audité de plan de salle. Capacité, nom, secteur, activation et position explicites; aucun client déplacé.", table, Object.keys(table)),
  tool("save_table", "Modifier une table existante via le RPC natif de plan de salle. Les paramètres absents sont conservés. TOK refuse désactivation ou réduction de capacité incompatible avec les clients déjà placés. Aucun changement direct des sièges.", { table_id: uuid, ...table }, ["table_id"]),
  tool("delete_table", "Supprimer une table par le RPC natif audité. TOK refuse une table ayant des clients placés. Une suppression n'annule jamais leurs réservations.", { table_id: uuid }, ["table_id"]),
  tool("set_layout", "Déplacer une table pour une date de service précise, ou rétablir sa position du modèle avec reset=true. Ne modifie ni capacité ni réservations. Fournir shape/x/y ensemble si reset=false.", { table_id: uuid, service_date: { type: "string", format: "date" }, reset: { type: "boolean" }, ...geometry }, ["table_id", "service_date", "reset"]),
  tool("assign_reservation", "Placer ou déplacer une réservation sur une table de cette succursale, ou retirer son placement avec clear_assignment=true. TOK contrôle capacité, conflits et autorisations dans sa transaction native. La réservation et ses paiements restent inchangés. Les échanges simultanés de plusieurs tables ne sont pas couverts.", { reservation_id: uuid, table_id: uuid, clear_assignment: { type: "boolean" } }, ["reservation_id", "clear_assignment"]),
  tool("set_preferred_table", "Définir ou retirer la table attitrée du client d'une réservation de mon restaurant. Le client est résolu depuis la réservation, jamais fourni librement. Ne déplace aucune réservation existante. Le motif est audité dans le journal MCP; le RPC natif audite le changement de table.", { reservation_id: uuid, table_id: uuid, clear_preference: { type: "boolean" } }, ["reservation_id", "clear_preference"]),
] as const;
export const TOK_FLOORPLAN_OPERATION_NAMES = new Set(TOK_FLOORPLAN_OPERATION_TOOLS.map((item) => item.name));

/** Caller identity, owner/MCP opt-in and schema guards are enforced by the role router. */
export async function invokeTokFloorplanOperation(name: string, args: Row, deps: {
  actor: RequestActor;
  read: (query: PromiseLike<{ data: unknown; error: unknown }>) => Promise<unknown>;
  fail: (status: number, message: string) => never;
  mutate: (operation: string, args: Row, run: () => Promise<Result>) => Promise<Result>;
}): Promise<Result> {
  const { actor, read, fail, mutate } = deps;
  const client = actor.userClient!, branch = String(args.branch_id), restaurant = String(args.restaurant_id);
  const found = await read(client.from("restaurant_branches").select("id").eq("id", branch).eq("restaurant_id", restaurant).maybeSingle());
  if (!found) return fail(404, "tok_connect_floorplan_branch_not_found");
  const success = (data: Row): Result => ({ statusCode: 200, payload: { ok: true, ...data } });
  if (name === "tok_get_restaurant_floor_plan") {
    const limit = Number(args.limit || 20), offset = Number(args.offset || 0);
    const [tables, layouts, reservations] = await Promise.all([
      read(client.from("reservation_tables").select("id,branch_id,table_number,capacity,sector,is_active,layout").eq("branch_id", branch).order("id").range(offset, offset + limit - 1)),
      read(client.from("reservation_table_layout_overrides").select("reservation_table_id,service_date,layout").eq("branch_id", branch).eq("service_date", args.service_date).order("reservation_table_id").range(offset, offset + limit - 1)),
      read(client.from("reservations").select("id,date,time,party_size,status").eq("restaurant_id", restaurant).eq("branch_id", branch).eq("date", args.service_date).order("id").range(offset, offset + limit - 1)),
    ]) as [Row[], Row[], Row[]];
    const slots = reservations.length ? await read(client.from("reservation_slots").select("reservation_id,table_id").in("reservation_id", reservations.map((row) => row.id)).order("reservation_id").limit(501)) as Row[] : [];
    return success({ restaurant_id: restaurant, branch_id: branch, service_date: args.service_date, tables, layouts, reservations, assignments: slots.slice(0, 500), assignments_truncated: slots.length > 500, limit, offset, pagination: "Each collection is independently paginated; assignments cover only the returned reservation page." });
  }
  if (String(args.reason).trim().length < 6) return fail(400, "tok_connect_floorplan_reason_invalid");
  const save = name === "tok_save_table_restaurant_floor_plan", add = name === "tok_add_table_restaurant_floor_plan";
  if (save && !Object.keys(table).some((key) => key in args)) return fail(400, "tok_connect_floorplan_patch_required");
  if (name === "tok_set_layout_restaurant_floor_plan" && (args.reset === false && !Object.keys(geometry).every((key) => key in args) || args.reset === true && Object.keys(geometry).some((key) => key in args))) return fail(400, "tok_connect_floorplan_layout_invalid");
  const assignment = name === "tok_assign_reservation_restaurant_floor_plan", preferred = name === "tok_set_preferred_table_restaurant_floor_plan";
  const clear = preferred ? args.clear_preference : args.clear_assignment;
  if ((assignment || preferred) && (clear === false && !args.table_id || clear === true && args.table_id)) return fail(400, "tok_connect_floorplan_target_invalid");
  return mutate(name, args, async () => {
    const rejected = (statusCode: number, error: string): Result => ({ statusCode, payload: { ok: false, error } });
    let rpcName: string, rpcArgs: Row;
    try {
      let existing: Row | null = null;
      if (args.table_id) {
        existing = await read(client.from("reservation_tables").select("id,table_number,capacity,sector,is_active,layout").eq("id", args.table_id).eq("branch_id", branch).maybeSingle()) as Row | null;
        if (!existing) return rejected(404, "tok_connect_floorplan_table_not_found");
      }
      if (save || add || name === "tok_delete_table_restaurant_floor_plan") {
        rpcName = "restaurant_save_floor_plan_template";
        const removing = name === "tok_delete_table_restaurant_floor_plan";
        const baseLayout = existing?.layout && typeof existing.layout === "object" ? existing.layout as Row : {};
        const layout: Row = { ...baseLayout, kind: "table", ...Object.fromEntries(Object.keys(geometry).filter((key) => key in args).map((key) => [key, args[key]])) };
        const row: Row = { client_id: add ? "mcp-new-table" : args.table_id, ...(save ? { id: args.table_id } : {}), ...Object.fromEntries(["table_number", "capacity", "sector", "is_active"].map((key) => [key, key in args ? args[key] : existing?.[key]])), layout };
        rpcArgs = { p_branch_id: branch, p_upserts: removing ? [] : [row], p_delete_ids: removing ? [args.table_id] : [], p_reason: String(args.reason).trim() };
      } else if (name === "tok_set_layout_restaurant_floor_plan") {
        rpcName = "restaurant_save_floor_plan_layouts";
        rpcArgs = { p_branch_id: branch, p_service_date: args.service_date, p_layouts: [{ table_id: args.table_id, layout: args.reset ? null : { kind: "table", ...Object.fromEntries(Object.keys(geometry).map((key) => [key, args[key]])) } }], p_reason: String(args.reason).trim() };
      } else {
        const reservation = await read(client.from("reservations").select("id,user_id,branch_id,status").eq("id", args.reservation_id).eq("restaurant_id", restaurant).maybeSingle()) as Row | null;
        if (!reservation) return rejected(404, "tok_connect_floorplan_reservation_not_found");
        if (reservation.branch_id && reservation.branch_id !== branch) return rejected(409, "tok_connect_floorplan_reservation_branch_mismatch");
        if (assignment) {
          if (["cancelled", "canceled", "no_show", "completed", "archived"].includes(String(reservation.status).toLowerCase())) return rejected(409, "tok_connect_floorplan_reservation_inactive");
          rpcName = "restaurant_save_floor_plan_assignments";
          rpcArgs = { p_branch_id: branch, p_assignments: { [String(args.reservation_id)]: clear ? null : args.table_id }, p_reason: String(args.reason).trim() };
        } else {
          if (!reservation.user_id) return rejected(409, "tok_connect_floorplan_customer_missing");
          rpcName = "restaurant_set_preferred_table";
          rpcArgs = { p_branch_id: branch, p_user_id: reservation.user_id, p_table_id: clear ? null : args.table_id };
        }
      }
    } catch { return rejected(503, "tok_connect_floorplan_validation_unavailable"); }
    const { data, error } = await client.rpc(rpcName, rpcArgs);
    if (error) return rejected(["P0001", "23514", "23505", "23503", "42501"].includes(String(error.code)) ? 409 : 503, "tok_connect_floorplan_native_rejected");
    if (!data || typeof data !== "object") return fail(503, "tok_connect_floorplan_reconciliation_required");
    // Do not forward customer identifiers from the native preferred-table result.
    return success({ restaurant_id: restaurant, branch_id: branch, ...(preferred ? { table_id: clear ? null : args.table_id } : { result: data }) });
  });
}
