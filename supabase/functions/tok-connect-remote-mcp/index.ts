import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import { TOK_ROLE_OPERATION_TOOLS } from "../_shared/tok-connect-role-operations.ts";
import { TOK_CUSTOMER_OPERATION_TOOLS } from "../_shared/tok-connect-customer-operations.ts";
import { projectTokCustomerResult } from "../_shared/tok-connect-customer-result.ts";
import {
  MCP_LATEST_PROTOCOL_VERSION,
  McpProtocolError,
  assertMcpAcceptHeader,
  assertMcpContentType,
  assertMcpProtocolVersion,
  assertMcpRoutingHeaders,
  negotiateMcpProtocolVersion,
  parseMcpJsonRpcRequest,
  type McpJsonRpcRequest,
} from "../_shared/mcp-http.ts";

const PUBLIC_ORIGIN = (Deno.env.get("TOK_CONNECT_PUBLIC_ORIGIN") || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const UPSTREAM_MCP_URL = `${SUPABASE_URL}/functions/v1/tok-connect-chatgpt`;
const APP_BRIDGE_URL = `${SUPABASE_URL}/functions/v1/tok-connect-app-bridge`;
const COMMERCIAL_BRIDGE_URL = `${SUPABASE_URL}/functions/v1/tok-connect-commercial-bridge`;
const AUTHORIZATION_SERVER = "https://www.thetok.ch/oauth";
const RESOURCE_METADATA_URL = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource`;
const OAUTH_SCOPES = ["tok"];
const MODERN_MCP_PROTOCOL_VERSION = "2026-07-28";
const INTERNAL_MCP_PROTOCOL_VERSION = "2025-11-25";
const CLAUDE_ORIGIN = "https://claude.ai";
const OAUTH_SECURITY = [{ type: "oauth2", scopes: OAUTH_SCOPES }];
const REMOTE_SERVER_INFO = { name: "TOK Connect Remote MCP", version: "6.1.0" } as const;
const REMOTE_INSTRUCTIONS = "TOK Connect operates the authenticated customer's and restaurant operator's TOK account through targeted tools. For restaurant discovery, call discover_restaurants with the user's request verbatim; its widget shows ranked clickable cards. To reserve a table, resolve the restaurant, then call prepare_customer_reservation with the requested local date, time and exact party_size. Ask for missing information or an ambiguous restaurant; never invent a time or guest count. The preparation opens the booking widget and checks availability. An explicit request to book a fully specified table authorizes tok_book_table; otherwise show the summary and ask the user. Read the guarantee quote and obtain explicit acceptance of any card guarantee first. Keep the same idempotency_key and identical arguments for retries of the same intent, including after OAuth reconnection. If the outcome is uncertain, read the customer's reservations and reconcile the reference; never generate a new key to bypass an in-progress operation. A created pending reservation is a request awaiting the restaurant, not an accepted booking. Report the actual returned status, reference and any payment requirement; a checkout URL is never proof of payment or confirmation. Cancellation also requires the user's explicit request. Restaurant operations require an owned restaurant selected from tok_list_my_restaurants; never infer ownership from a user-supplied role. All actions use the user's JWT, native TOK business services, ownership checks and audit. For restaurant marketing, first read tok_list_restaurant_marketing_references for the owned restaurant and get_tok_credit_balance. Pass the selected reference_media_ids to generation; if none exist, request references in the native Studio. Read tok_list_restaurant_marketing_assets to retrieve stored images. Never invent an image URL or regenerate with a new key after a timeout. Then use tok_generate_restaurant_campaign_draft to create a native unlaunched Studio draft, and tok_generate_restaurant_marketing_visual for one native gallery visual; these may consume TOK credits and need explicit confirmation, while budgets default to zero and publishing stays protected. To add a menu dish with a photo, first call tok_create_restaurant_menu_item, then tok_generate_restaurant_dish_photo for its returned menu_item_id, show the generated image, and only after user approval use tok_attach_restaurant_dish_photo with the returned assetId. The commercial role remains isolated behind its guarded backend and is unavailable through the public MCP. Generic CRUD, arbitrary RPCs, admin, service-role, scheduler and webhook operations remain unavailable. Host authentication, confirmation and payment controls still apply.";
const MODERN_CACHEABLE_METHODS = new Set([
  "tools/list",
  "prompts/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
]);
const PUBLIC_MCP_READ_ONLY_ERROR = "public_mcp_read_only";

type JsonRecord = Record<string, unknown>;

const APP_BRIDGE_TOOLS = [
  {
    name: "tok_list_capabilities",
    title: "List authenticated TOK capabilities",
    description: "List which TOK actions are executable through this MCP for the authenticated account, and distinguish backend-only functions from supported tools. This catalogue does not itself execute any action.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_invoke_capability",
    title: "Execute a TOK application capability",
    description: "Execute an allowlisted TOK Edge Function using the authenticated user's JWT. Sensitive actions require explicit user confirmation and an idempotency key. The downstream TOK backend rechecks roles, ownership, payments and business rules.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["capability"],
      properties: {
        capability: { type: "string", minLength: 1, maxLength: 120 },
        method: { type: "string", enum: ["GET", "POST"] },
        payload: { type: "object" },
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_invoke_rpc",
    title: "Execute an authorized TOK business RPC",
    description: "Execute a TOK restaurant_* or admin_* business RPC with the authenticated user's database identity. Restaurant RPCs require restaurateur access; admin RPCs require the admin role. Confirmation and idempotency are mandatory.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["rpc_name", "args", "confirmed_by_user", "idempotency_key"],
      properties: {
        rpc_name: { type: "string", pattern: "^(restaurant_|admin_)[A-Za-z0-9_]+$", maxLength: 160 },
        args: { type: "object" },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_data",
    title: "Read or mutate an allowlisted TOK data surface",
    description: "Read or mutate a server-allowlisted TOK data surface under the authenticated user's RLS identity. Transactional tables are read-only; direct writes exist only for tables the application itself edits under RLS. Writes require confirmation and idempotency, and update/delete require filters.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["table", "operation"],
      properties: {
        table: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$", maxLength: 120 },
        operation: { type: "string", enum: ["select", "insert", "update", "delete"] },
        select: { type: "string", maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        filters: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["column", "value"],
            properties: {
              column: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
              operator: { type: "string", enum: ["eq", "neq", "is", "in"] },
              value: {},
            },
            additionalProperties: false,
          },
        },
        values: {},
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_commercial",
    title: "Operate the authenticated TOK commercial workspace",
    description: "Use commercial-only TOK RPCs, read commercial RLS data, or provision the isolated demo session. The commercial bridge requires the commercial or admin role; mutating RPCs and demo provisioning require confirmation and idempotency.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "rpc", "read", "demo_session"] },
        rpc_name: { type: "string", maxLength: 160 },
        args: { type: "object" },
        table: { type: "string", maxLength: 160 },
        select: { type: "string", maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        filters: { type: "array", maxItems: 20, items: { type: "object" } },
        payload: { type: "object" },
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
];


/**
 * Public ChatGPT actions are deliberately narrower than tok_invoke_capability.
 * They run through TOK's existing authenticated business functions, never the
 * partner-B2B reservation API (which uses unrelated partner/client UUIDs).
 */
const TOK_CLIENT_WIDGET_META = {
  ui: { resourceUri: "ui://tok-connect/restaurant-discovery-v1.html", visibility: ["model", "app"] },
  "openai/widgetAccessible": true,
  "openai/outputTemplate": "ui://tok-connect/restaurant-discovery-v1.html",
} as const;

const TOK_RESTAURANT_STUDIO_WIDGET_TOOLS = new Set([
  "tok_generate_restaurant_campaign_draft",
  "tok_generate_restaurant_marketing_visual",
  "tok_generate_restaurant_dish_photo",
  "tok_attach_restaurant_dish_photo",
]);
const TOK_RESTAURANT_STUDIO_WIDGET_META = {
  ui: { resourceUri: "ui://tok-connect/actions-window-v1.html", visibility: ["model", "app"] },
  "openai/outputTemplate": "ui://tok-connect/actions-window-v1.html",
  "openai/widgetAccessible": true,
} as const;
const TOK_ROLE_TOOLS = TOK_ROLE_OPERATION_TOOLS.map((tool) => ({
  ...tool,
  securitySchemes: OAUTH_SECURITY,
  _meta: {
    securitySchemes: OAUTH_SECURITY,
    ...(TOK_RESTAURANT_STUDIO_WIDGET_TOOLS.has(tool.name) ? TOK_RESTAURANT_STUDIO_WIDGET_META : {}),
  },
}));
const TOK_ROLE_TOOL_NAMES = new Set(TOK_ROLE_TOOLS.map((tool) => tool.name));
const TOK_CUSTOMER_OPERATION_PUBLIC_TOOLS = TOK_CUSTOMER_OPERATION_TOOLS.map((tool) => ({
  ...tool, securitySchemes: OAUTH_SECURITY, _meta: { securitySchemes: OAUTH_SECURITY },
}));
const TOK_CUSTOMER_OPERATION_NAMES = new Set(TOK_CUSTOMER_OPERATION_PUBLIC_TOOLS.map((tool) => tool.name));

const TOK_CLIENT_TOOLS = [
  {
    name: "tok_list_customer_special_offers",
    title: "Offres anti-gaspi et flash TOK",
    description: "Afficher les offres anti-gaspi et ventes flash commandables d'un restaurant TOK, leurs identifiants canoniques, prix CHF, quantités et fenêtres locales Europe/Zurich. Le stock reste indicatif et n'est pas réservé par cette lecture. Utiliser exactement ces identifiants avec tok_quote_customer_cart ; anti-gaspi uniquement à emporter, ventes flash selon leurs modes autorisés.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", required: ["restaurant_id"], properties: { restaurant_id: { type: "string", format: "uuid" }, kind: { type: "string", enum: ["all", "antigaspi", "flash"] } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_quote_reservation",
    title: "Vérifier les conditions de réservation TOK",
    description: "Read card guarantee requirements for the authenticated customer before asking them to confirm a table.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["party_size"],
      properties: { party_size: { type: "integer", minimum: 1, maximum: 20 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_book_table",
    title: "Réserver une table chez TOK",
    description: "Use when the user explicitly asks to reserve a specific table for a date, time and guest count. Call prepare_customer_reservation first and use its exact details. Check the guarantee quote and obtain acceptance if required. Creates one real reservation under the signed-in customer's identity; pending means awaiting restaurant acceptance. Preserve the same idempotency_key for retries and after reauthentication. Never treat a checkout URL as a completed booking.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "date", "time", "party_size", "confirmed_by_user", "idempotency_key"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        date: { type: "string", format: "date" },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
        notes: { type: "string", maxLength: 1000 },
        guarantee_accepted: { type: "boolean" },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_my_reservations",
    title: "Mes réservations TOK",
    description: "Read only the authenticated customer's own recent reservations, never restaurant or admin account data.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_my_orders",
    title: "Mes commandes TOK",
    description: "Read only the authenticated customer's own recent orders and their payment status.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_quote_customer_cart",
    title: "Vérifier le prix d'une commande TOK",
    description: "Prepare the customer's takeaway, delivery or Zero Attente cart with server-authoritative prices and service conditions. Delivery requires the exact Swiss delivery_address; show the address, delivery fees and total for approval before checkout. No payment or order is created.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "journey", "items", "date", "time"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        journey: { type: "string", enum: ["takeaway", "delivery", "zero-attente"] },
        delivery_address: { type: "string", minLength: 10, maxLength: 300, description: "Required for delivery: exact Swiss street, building number, postal code and city confirmed by the customer." },
        items: {
          type: "array", minItems: 1, maxItems: 24,
          items: {
            type: "object", required: ["menu_item_id", "quantity"],
            properties: {
              menu_item_id: { type: "string", pattern: "^(?:(?:antigaspi|flash)-)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", description: "Menu UUID, or exact canonical antigaspi-UUID / flash-UUID returned by tok_list_customer_special_offers. No invented offer identifiers or client prices." },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
            },
            additionalProperties: false,
          },
        },
        date: { type: "string", format: "date" },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
        payment_method: { type: "string", enum: ["card", "twint"] },
        notes: { type: "string", maxLength: 500 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_checkout_customer_cart",
    title: "Confirmer et payer une commande TOK",
    description: "Start TOK Stripe Checkout only after explicit approval of a fresh server-priced cart, including delivery_address and delivery fees for delivery. Keep payment_attempt_id and idempotency_key stable on retries. The Stripe link is a pending payment, never proof of a paid order or accepted table.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "journey", "items", "date", "time", "expected_total_cents", "payment_attempt_id", "idempotency_key", "confirmed_by_user"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        journey: { type: "string", enum: ["takeaway", "delivery", "zero-attente"] },
        delivery_address: { type: "string", minLength: 10, maxLength: 300, description: "Required for delivery; preserve the exact address from the accepted quote." },
        items: {
          type: "array", minItems: 1, maxItems: 24,
          items: {
            type: "object", required: ["menu_item_id", "quantity"],
            properties: {
              menu_item_id: { type: "string", pattern: "^(?:(?:antigaspi|flash)-)?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
            },
            additionalProperties: false,
          },
        },
        date: { type: "string", format: "date" },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
        payment_method: { type: "string", enum: ["card", "twint"] },
        notes: { type: "string", maxLength: 500 },
        expected_total_cents: { type: "integer", minimum: 0, maximum: 1000000 },
        payment_attempt_id: { type: "string", format: "uuid" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120 },
        confirmed_by_user: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_customer_payment_status",
    title: "Vérifier le paiement de ma commande TOK",
    description: "Read the status of the authenticated customer's own Stripe payment attempt; never interpret an open checkout as a paid order.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object", required: ["payment_attempt_id"],
      properties: { payment_attempt_id: { type: "string", format: "uuid" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_cancel_cart_payment_attempt",
    title: "Annuler une tentative de paiement TOK",
    description: "Expire the customer's own unpaid Stripe Checkout and release any reserved capacity after explicit confirmation; an indeterminate cancellation does not release the widget cart.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object", required: ["payment_attempt_id", "confirmed_by_user", "idempotency_key"],
      properties: {
        payment_attempt_id: { type: "string", format: "uuid" },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
  {
    name: "tok_cancel_my_reservation",
    title: "Annuler ma réservation classique TOK",
    description: "Use when the customer explicitly asks to cancel one of their own unpaid classic reservations. Resolve the reference from tok_my_reservations when necessary. Preserve the same idempotency_key on retries. Paid reservations require TOK's dedicated refund flow.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["reservation_id", "confirmed_by_user", "idempotency_key"],
      properties: {
        reservation_id: { type: "string", format: "uuid" },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOK_CLIENT_WIDGET_META },
  },
] as const;
const TOK_CLIENT_TOOL_NAMES = new Set(TOK_CLIENT_TOOLS.map((tool) => tool.name));
const TOK_CLIENT_MUTATION_NAMES = new Set(["tok_book_table", "tok_cancel_my_reservation", "tok_checkout_customer_cart", "tok_cancel_cart_payment_attempt"]);

function assertTokClientArgs(name: string, args: JsonRecord) {
  if (name === "tok_quote_reservation" || name === "tok_book_table") {
    if (typeof args.party_size !== "number" || !Number.isInteger(args.party_size) || args.party_size < 1 || args.party_size > 20)
      throw new McpProtocolError(-32602, "tok_party_size_invalid", 400);
  }
  if (name === "tok_book_table") {
    if (!isUuid(String(args.restaurant_id || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(args.date || ""))
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(args.time || "")))
      throw new McpProtocolError(-32602, "tok_reservation_fields_invalid", 400);
    if (args.notes !== undefined && (typeof args.notes !== "string" || args.notes.length > 1000))
      throw new McpProtocolError(-32602, "tok_reservation_notes_invalid", 400);
  }
  if (name === "tok_cancel_my_reservation" && !isUuid(String(args.reservation_id || "")))
    throw new McpProtocolError(-32602, "tok_reservation_id_invalid", 400);
  if (TOK_CLIENT_MUTATION_NAMES.has(name)) {
    if (args.confirmed_by_user !== true || !/^[A-Za-z0-9:_-]{8,120}$/.test(String(args.idempotency_key || "")))
      throw new McpProtocolError(-32602, "tok_explicit_confirmation_and_idempotency_required", 400);
  }
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const APP_BRIDGE_TOOL_NAMES = new Set([...APP_BRIDGE_TOOLS.map((tool) => tool.name), ...TOK_CLIENT_TOOL_NAMES, ...TOK_ROLE_TOOL_NAMES, ...TOK_CUSTOMER_OPERATION_NAMES]);
const PUBLIC_READ_ONLY_TOOL_NAMES = new Set<string>();

function isReadOnlyTool(tool: unknown) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
  const annotations = (tool as JsonRecord).annotations as JsonRecord | undefined;
  return annotations?.readOnlyHint === true;
}

function filterPublicReadOnlyTools(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rpc = payload as JsonRecord;
  const result = rpc.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const upstreamTools = Array.isArray((result as JsonRecord).tools) ? (result as JsonRecord).tools as unknown[] : [];
  const seen = new Set(upstreamTools.map((tool) => tool && typeof tool === "object" ? String((tool as JsonRecord).name || "") : ""));
  const additions = [...APP_BRIDGE_TOOLS.filter(isReadOnlyTool), ...TOK_CLIENT_TOOLS, ...TOK_ROLE_TOOLS, ...TOK_CUSTOMER_OPERATION_PUBLIC_TOOLS]
    .filter((tool) => !seen.has(tool.name));
  // Explicitly named client writes only. All generic RPC, admin, payment and
  // restaurant tools remain undiscoverable and blocked by default.
  const tools = [...upstreamTools, ...additions].filter((tool) => (
    isReadOnlyTool(tool) || (
      Boolean(tool && typeof tool === "object")
      && (TOK_CLIENT_MUTATION_NAMES.has(String((tool as JsonRecord).name || ""))
        || TOK_ROLE_TOOL_NAMES.has(String((tool as JsonRecord).name || ""))
        || TOK_CUSTOMER_OPERATION_NAMES.has(String((tool as JsonRecord).name || "")))
    )
  ));

  PUBLIC_READ_ONLY_TOOL_NAMES.clear();
  for (const tool of tools) {
    const name = tool && typeof tool === "object" ? String((tool as JsonRecord).name || "") : "";
    if (name) PUBLIC_READ_ONLY_TOOL_NAMES.add(name);
  }

  return { ...rpc, result: { ...(result as JsonRecord), tools } };
}

function mergeTools(payload: unknown) {
  return filterPublicReadOnlyTools(payload);
}

function remoteCorsHeaders(req: Request) {
  const headers = buildCorsHeaders(req);
  if (req.headers.get("origin") === CLAUDE_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = CLAUDE_ORIGIN;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function isRemoteMcpOriginAllowed(req: Request) {
  return isRequestOriginAllowed(req) || req.headers.get("origin") === CLAUDE_ORIGIN;
}

function isModernMcpRequest(req: Request) {
  return req.headers.get("mcp-protocol-version") === MODERN_MCP_PROTOCOL_VERSION;
}

function jsonRpcResult(id: McpJsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id: McpJsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function requestHeaders(req: Request, rpc: McpJsonRpcRequest) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: req.headers.get("accept") || "application/json, text/event-stream",
  });
  for (const name of ["authorization", "origin", "user-agent", "last-event-id"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const protocolVersion = req.headers.get("mcp-protocol-version");
  headers.set(
    "mcp-protocol-version",
    protocolVersion === MODERN_MCP_PROTOCOL_VERSION ? INTERNAL_MCP_PROTOCOL_VERSION : protocolVersion || INTERNAL_MCP_PROTOCOL_VERSION,
  );
  const sessionId = req.headers.get("mcp-session-id");
  if (sessionId && protocolVersion !== MODERN_MCP_PROTOCOL_VERSION) headers.set("mcp-session-id", sessionId);
  headers.set("mcp-method", rpc.method);
  if (rpc.method === "tools/call") {
    const toolName = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    if (toolName) headers.set("mcp-name", toolName);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (anonKey) headers.set("apikey", anonKey);
  return headers;
}

function responseHeaders(req: Request, upstream?: Response) {
  const headers = new Headers(remoteCorsHeaders(req));
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow, nosnippet, noarchive");
  headers.set("content-type", upstream?.headers.get("content-type") || "application/json");
  headers.set(
    "mcp-protocol-version",
    req.headers.get("mcp-protocol-version") || upstream?.headers.get("mcp-protocol-version") || MCP_LATEST_PROTOCOL_VERSION,
  );
  for (const name of ["www-authenticate", "mcp-session-id"]) {
    const value = upstream?.headers.get(name);
    if (value && !(name === "mcp-session-id" && isModernMcpRequest(req))) {
      headers.set(name, value);
    }
  }
  return headers;
}

function normalizeInitialize(payload: unknown, request: McpJsonRpcRequest) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rpc = payload as Record<string, unknown>;
  const result = rpc.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const next = { ...(result as Record<string, unknown>) };
  next.protocolVersion = negotiateMcpProtocolVersion(request.params);
  next.serverInfo = REMOTE_SERVER_INFO;
  next.instructions = REMOTE_INSTRUCTIONS;
  return { ...rpc, result: next };
}

function buildServerDiscoverResult(id: McpJsonRpcRequest["id"]) {
  return jsonRpcResult(id, {
    resultType: "complete",
    supportedVersions: [MODERN_MCP_PROTOCOL_VERSION],
    capabilities: { tools: {}, resources: {}, prompts: {} },
    _meta: { "io.modelcontextprotocol/serverInfo": REMOTE_SERVER_INFO },
    instructions: REMOTE_INSTRUCTIONS,
    ttlMs: 30_000,
    cacheScope: "public",
  });
}

function normalizeModernResult(req: Request, rpc: McpJsonRpcRequest, payload: unknown) {
  if (!isModernMcpRequest(req) || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const response = payload as JsonRecord;
  const result = response.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const current = result as JsonRecord;
  const currentMeta = current._meta && typeof current._meta === "object" && !Array.isArray(current._meta)
    ? current._meta as JsonRecord
    : {};
  const next: JsonRecord = {
    ...current,
    resultType: typeof current.resultType === "string" ? current.resultType : "complete",
    _meta: { ...currentMeta, "io.modelcontextprotocol/serverInfo": REMOTE_SERVER_INFO },
  };
  if (MODERN_CACHEABLE_METHODS.has(rpc.method)) {
    if (typeof next.ttlMs !== "number") next.ttlMs = 30_000;
    if (next.cacheScope !== "public" && next.cacheScope !== "private") next.cacheScope = "private";
  }
  return { ...response, result: next };
}

async function upstreamRequest(req: Request, rpc: McpJsonRpcRequest) {
  return await fetch(UPSTREAM_MCP_URL, { method: "POST", headers: requestHeaders(req, rpc), body: JSON.stringify(rpc) });
}

async function resolvePublicReadOnlyToolNames(req: Request) {
  if (PUBLIC_READ_ONLY_TOOL_NAMES.size > 0) return new Set(PUBLIC_READ_ONLY_TOOL_NAMES);

  const listingRpc: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: "tok-public-read-only-tools",
    method: "tools/list",
    params: {},
  };
  const upstream = await upstreamRequest(req, listingRpc);
  const text = await upstream.text();
  if (upstream.ok && text) {
    try {
      filterPublicReadOnlyTools(JSON.parse(text));
    } catch {
      // Fall through to the local read-only bridge tools below.
    }
  }

  if (PUBLIC_READ_ONLY_TOOL_NAMES.size === 0) {
    for (const tool of [...APP_BRIDGE_TOOLS, ...TOK_CLIENT_TOOLS, ...TOK_ROLE_TOOLS, ...TOK_CUSTOMER_OPERATION_PUBLIC_TOOLS]) {
      if (isReadOnlyTool(tool) || TOK_CLIENT_MUTATION_NAMES.has(tool.name) || TOK_ROLE_TOOL_NAMES.has(tool.name) || TOK_CUSTOMER_OPERATION_NAMES.has(tool.name))
        PUBLIC_READ_ONLY_TOOL_NAMES.add(tool.name);
    }
  }
  return new Set(PUBLIC_READ_ONLY_TOOL_NAMES);
}

function authToolResult(message = "Connexion TOK requise pour cette action.") {
  const challenge = `Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="${OAUTH_SCOPES.join(" ")}", error="invalid_token", error_description="Sign in to TOK to continue"`;
  return { content: [{ type: "text", text: message }], isError: true, _meta: { "mcp/www_authenticate": [challenge] } };
}

function bridgeToolBody(name: string, args: JsonRecord) {
  if (TOK_ROLE_TOOL_NAMES.has(name)) return { mode: "role_operation", operation: name, args };
  if (TOK_CUSTOMER_OPERATION_NAMES.has(name)) return { mode: "customer_operation", operation: name, args };
  if (TOK_CLIENT_TOOL_NAMES.has(name as typeof TOK_CLIENT_TOOLS[number]["name"])) {
    assertTokClientArgs(name, args);
    if (name === "tok_list_customer_special_offers") return { mode: "customer_commerce", action: "special_offers", restaurant_id: args.restaurant_id, kind: args.kind };
    if (name === "tok_quote_customer_cart" || name === "tok_checkout_customer_cart") {
      return {
        mode: "customer_commerce",
        action: name === "tok_quote_customer_cart" ? "quote" : "checkout",
        restaurant_id: args.restaurant_id, journey: args.journey,
        delivery_address: args.delivery_address,
        items: args.items, date: args.date, time: args.time,
        party_size: args.party_size, payment_method: args.payment_method,
        notes: args.notes, expected_total_cents: args.expected_total_cents,
        payment_attempt_id: args.payment_attempt_id,
        idempotency_key: args.idempotency_key,
        confirmed_by_user: args.confirmed_by_user,
      };
    }
    if (name === "tok_customer_payment_status") {
      return { mode: "customer_commerce", action: "status",
        payment_attempt_id: args.payment_attempt_id };
    }
    if (name === "tok_cancel_cart_payment_attempt") {
      return { mode: "customer_commerce", action: "cancel_attempt",
        payment_attempt_id: args.payment_attempt_id,
        idempotency_key: args.idempotency_key,
        confirmed_by_user: args.confirmed_by_user };
    }
    if (name === "tok_quote_reservation") {
      return { mode: "edge", capability: "reservations.classic.quote", method: "POST",
        payload: { action: "quote", party_size: args.party_size } };
    }
    if (name === "tok_book_table") {
      return { mode: "edge", capability: "reservations.classic.create", method: "POST",
        confirmed_by_user: true, idempotency_key: args.idempotency_key,
        payload: {
          action: "create", feature: "classique",
          restaurant_id: args.restaurant_id, date: args.date, time: args.time, party_size: args.party_size,
          notes: args.notes || null, guarantee_accepted: args.guarantee_accepted === true,
        } };
    }
    if (name === "tok_cancel_my_reservation") {
      return { mode: "rpc", rpc_name: "cancel_reservation_by_customer",
        args: { p_reservation_id: args.reservation_id },
        confirmed_by_user: true, idempotency_key: args.idempotency_key };
    }
    return { mode: "customer_history", kind: name === "tok_my_reservations" ? "reservations" : "orders",
      limit: args.limit };
  }
  if (name === "tok_list_capabilities") return { mode: "edge", action: "list" };
  if (name === "tok_invoke_capability") return {
    mode: "edge", capability: args.capability, method: args.method, payload: args.payload || {},
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
  if (name === "tok_invoke_rpc") return {
    mode: "rpc", rpc_name: args.rpc_name, args: args.args || {},
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
  if (name === "tok_commercial") return {
    action: args.action,
    rpc_name: args.rpc_name,
    args: args.args || {},
    table: args.table,
    select: args.select,
    limit: args.limit,
    filters: args.filters || [],
    payload: args.payload || {},
    confirmed_by_user: args.confirmed_by_user,
    idempotency_key: args.idempotency_key,
  };
  return {
    mode: "data", table: args.table, operation: args.operation, select: args.select, limit: args.limit,
    filters: args.filters || [], values: args.values,
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
}

async function callAppBridge(req: Request, rpc: McpJsonRpcRequest, name: string) {
  const authorization = req.headers.get("authorization");
  if (!authorization) return jsonRpcResult(rpc.id, authToolResult());
  const args = rpc.params?.arguments && typeof rpc.params.arguments === "object" && !Array.isArray(rpc.params.arguments)
    ? rpc.params.arguments as JsonRecord
    : {};
  const headers = new Headers({ "content-type": "application/json", accept: "application/json", authorization });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (anonKey) headers.set("apikey", anonKey);
  const targetUrl = name === "tok_commercial" ? COMMERCIAL_BRIDGE_URL : APP_BRIDGE_URL;
  let response: Response;
  try {
    response = await fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(bridgeToolBody(name, args)), signal: AbortSignal.timeout(name === "tok_generate_restaurant_dish_photo" ? 130_000 : name === "tok_generate_restaurant_campaign_draft" ? 100_000 : 55_000) });
  } catch (error) {
    if (!TOK_RESTAURANT_STUDIO_WIDGET_TOOLS.has(name)) throw error;
    return jsonRpcResult(rpc.id, {
      content: [{ type: "text", text: "Résultat TOK non confirmé. Conservez la même clé d’idempotence et vérifiez la galerie avant toute relance. Aucun nouvel essai automatique." }],
      structuredContent: { ok: false, error: { code: "tok_connect_studio_result_unconfirmed" }, retry_with_same_key_only: true },
      isError: true,
    });
  }
  const bridgePayload = await response.json().catch(() => ({ ok: false, error: { code: "tok_connect_bridge_invalid_response", message: "tok_connect_bridge_invalid_response" } })) as JsonRecord;
  if (response.status === 401) return jsonRpcResult(rpc.id, authToolResult());
  const payload = projectTokCustomerResult(name, args, bridgePayload);
  const text = payload.ok === false
    ? String((payload.error as JsonRecord | undefined)?.message || (payload.error as JsonRecord | undefined)?.code || "TOK action failed")
    : JSON.stringify(payload);
  return jsonRpcResult(rpc.id, {
    content: [{ type: "text", text }], structuredContent: payload, ...(response.ok && payload.ok !== false ? {} : { isError: true }),
  });
}

async function relay(req: Request, rpc: McpJsonRpcRequest) {
  if (rpc.method === "server/discover") {
    return new Response(JSON.stringify(buildServerDiscoverResult(rpc.id)), { status: 200, headers: responseHeaders(req) });
  }
  if (rpc.method === "tools/call") {
    const name = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    const readOnlyToolNames = await resolvePublicReadOnlyToolNames(req);
    if (!name || !readOnlyToolNames.has(name)) {
      return new Response(JSON.stringify(jsonRpcError(rpc.id, -32602, PUBLIC_MCP_READ_ONLY_ERROR)), {
        status: 400,
        headers: responseHeaders(req),
      });
    }
    // The canonical visual tool advertises a normalized marketing_visual schema.
    // Keep its OAuth/grant checks, 130s timeout and verified gallery result;
    // the generic role bridge returns a different envelope.
    if (APP_BRIDGE_TOOL_NAMES.has(name) && name !== "tok_generate_restaurant_marketing_visual") {
      const payload = normalizeModernResult(req, rpc, await callAppBridge(req, rpc, name));
      return new Response(JSON.stringify(payload), { status: 200, headers: responseHeaders(req) });
    }
  }
  const upstream = await upstreamRequest(req, rpc);
  const text = await upstream.text();
  if (!text) return new Response(null, { status: upstream.status, headers: responseHeaders(req, upstream) });
  try {
    const parsed = JSON.parse(text);
    const compatiblePayload = rpc.method === "initialize"
      ? normalizeInitialize(parsed, rpc)
      : rpc.method === "tools/list"
        ? mergeTools(parsed)
        : parsed;
    const payload = normalizeModernResult(req, rpc, compatiblePayload);
    return new Response(JSON.stringify(payload), { status: upstream.status, headers: responseHeaders(req, upstream) });
  } catch {
    return new Response(text, { status: upstream.status, headers: responseHeaders(req, upstream) });
  }
}

Deno.serve(async (req) => {
  const corsHeaders = remoteCorsHeaders(req);
  if (!isRemoteMcpOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  const url = new URL(req.url);
  if (url.searchParams.get("tok_connect_route") === "protected-resource") {
    return new Response(JSON.stringify({
      resource: `${PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [AUTHORIZATION_SERVER],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${PUBLIC_ORIGIN}/tok-connect/developer`,
      mcp_protocol_versions_supported: [MODERN_MCP_PROTOCOL_VERSION, "2025-11-25", "2025-06-18", "2025-03-26"],
    }), {
      status: 200,
      headers: new Headers({ ...corsHeaders, "content-type": "application/json", "cache-control": "no-store", "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION }),
    });
  }
  if (req.method === "GET") {
    return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "POST, OPTIONS", "cache-control": "no-store", "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION }) });
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "POST, OPTIONS" }) });

  let rpc: McpJsonRpcRequest | null = null;
  try {
    assertMcpAcceptHeader(req);
    assertMcpContentType(req);
    rpc = await parseMcpJsonRpcRequest(req);
    assertMcpProtocolVersion(req, rpc.method);
    assertMcpRoutingHeaders(req, rpc);
    return await relay(req, rpc);
  } catch (error) {
    const protocolError = error instanceof McpProtocolError
      ? error
      : new McpProtocolError(-32000, error instanceof Error ? error.message : "tok_connect_remote_mcp_error", 500);
    return new Response(JSON.stringify(jsonRpcError(rpc?.id, protocolError.code, protocolError.message)), {
      status: protocolError.httpStatus,
      headers: responseHeaders(req),
    });
  }
});
