/** Closed marketing BFF catalogue. Authentication and business validation stay in the BFF. */
export type TokMarketingAccess = "read" | "write" | "execute";
export type TokMarketingEndpoint = "rpc" | "agent" | "orchestrator";
type Row = Record<string, unknown>;
type Definition = readonly [string, TokMarketingAccess, readonly string[]];

const rpcDefinitions: readonly Definition[] = [
  ["admin_approve_marketing_campaign", "write", ["p_campaign_id", "p_reason"]],
  ["admin_approve_marketing_item", "write", ["p_item_id", "p_scheduled_at"]],
  ["admin_cancel_marketing_item", "write", ["p_item_id", "p_reason"]],
  ["admin_complete_manual_marketing_delivery", "write", ["p_delivery_id", "p_outcome", "p_note"]],
  ["admin_complete_manual_marketing_item", "write", ["p_item_id", "p_outcome", "p_note"]],
  ["admin_create_marketing_campaign_bundle", "write", ["p_payload", "p_client_request_id"]],
  ["admin_estimate_marketing_audience", "read", ["p_filter", "p_channels"]],
  ["admin_get_marketing_overview", "read", ["p_from", "p_to"]],
  ["admin_list_marketing_automations", "read", ["p_status", "p_limit", "p_cursor_updated_at", "p_cursor_id"]],
  ["admin_list_marketing_calendar", "read", ["p_from", "p_to", "p_status", "p_channel", "p_limit", "p_cursor_scheduled_at", "p_cursor_id"]],
  ["admin_list_marketing_campaigns", "read", ["p_status", "p_limit", "p_cursor_updated_at", "p_cursor_id"]],
  ["admin_list_marketing_campaign_items", "read", ["p_campaign_id", "p_limit", "p_cursor_scheduled_at", "p_cursor_id"]],
  ["admin_list_marketing_contacts", "read", ["p_query", "p_status", "p_channel", "p_limit", "p_offset"]],
  ["admin_list_marketing_deliveries", "read", ["p_query", "p_status", "p_channel", "p_limit", "p_offset"]],
  ["admin_list_marketing_integrations", "read", ["p_channel", "p_limit", "p_cursor_id"]],
  ["admin_reveal_manual_delivery_target", "write", ["p_delivery_id", "p_reason"]],
  ["admin_retry_marketing_delivery", "write", ["p_delivery_id"]],
  ["admin_set_marketing_global_pause", "write", ["p_paused", "p_reason"]],
  ["admin_suppress_marketing_contact", "write", ["p_contact_id", "p_reason"]],
  ["admin_sync_marketing_client_consents", "write", ["p_limit", "p_cursor"]],
  ["admin_sync_marketing_prospect_catalog", "write", ["p_limit", "p_after_source_objectid", "p_until_source_objectid"]],
  ["admin_upsert_marketing_automation", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_upsert_marketing_calendar_item", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_upsert_marketing_campaign", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_upsert_marketing_contact", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_list_marketing_outreach", "read", ["p_kind", "p_status", "p_limit", "p_cursor_updated_at", "p_cursor_id"]],
  ["admin_upsert_marketing_outreach_target", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_upsert_marketing_outreach_opportunity", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_upsert_marketing_outreach_draft", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_approve_marketing_outreach_draft", "write", ["p_draft_id", "p_reason"]],
  ["admin_record_marketing_outreach_result", "write", ["p_opportunity_id", "p_status", "p_note", "p_published_url"]],
  ["admin_upsert_marketing_backlink", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_get_marketing_autopilot_dashboard", "read", ["p_from", "p_to"]],
  ["admin_prepare_marketing_automation_action", "write", ["p_automation_key", "p_input", "p_client_request_id", "p_simulation_key", "p_reason"]],
  ["admin_simulate_marketing_automation", "write", ["p_automation_key", "p_input"]],
  ["admin_update_marketing_provider_control", "write", ["p_provider", "p_control_state", "p_reason"]],
  ["admin_upsert_marketing_asset", "write", ["p_payload", "p_expected_updated_at"]],
  ["admin_get_marketing_daily_series", "read", []],
  ["admin_upsert_marketing_daily_series", "write", ["p_payload"]],
];
const agentDefinitions: readonly Definition[] = [
  ["generate", "execute", ["objective", "audienceHint", "channels", "formats", "startsAt", "endsAt", "itemCount", "campaignOptions", "mailingOptions"]],
  ["list_runs", "read", []],
  ["discover_sources", "execute", ["query", "limit", "withoutAccountOnly"]],
  ["mailing_facets", "read", ["field", "query", "after"]],
  ["interpret_mailing", "execute", ["prompt"]],
  ["upload_mailing_image", "write", ["itemId", "expectedUpdatedAt", "contentType", "imageBase64"]],
  ["prepare_mailing_recipients", "write", ["recipientEmails"]],
];
const orchestratorDefinitions: readonly Definition[] = [
  ["run_due", "execute", ["limit"]],
  ["run_item", "execute", ["itemId", "limit"]],
  ["check_meta", "execute", []],
  ["instagram_discover", "execute", ["hashtags", "usernames", "days"]],
  ["instagram_comments", "execute", ["mediaId", "after"]],
  ["instagram_review_submit", "execute", ["postUrl", "username", "commentText", "commentLikes", "replyText", "observation"]],
  ["instagram_review_list", "read", []],
];

export const TOK_MARKETING_RPC_OPERATIONS = rpcDefinitions.map(([name]) => name);
export const TOK_MARKETING_AGENT_ACTIONS = agentDefinitions.map(([name]) => name);
export const TOK_MARKETING_ORCHESTRATOR_ACTIONS = orchestratorDefinitions.map(([name]) => name);

export interface TokMarketingTool {
  name: string;
  title: string;
  description: string;
  endpoint: TokMarketingEndpoint;
  path: `/api/marketing/${TokMarketingEndpoint}`;
  backendOperation: string;
  access: TokMarketingAccess;
  requiresConfirmation: boolean;
  allowedArgs: readonly string[];
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}

function argumentSchema(key: string): Row {
  const label = key.replace(/^p_/, "").replace(/_/g, " ");
  const description = `${label}. Native marketing BFF argument; its business validation remains authoritative.`;
  if (["p_payload", "p_input", "p_filter", "campaignOptions", "mailingOptions"].includes(key)) return { type: "object", description };
  if (["p_channels", "channels", "formats", "recipientEmails", "hashtags", "usernames"].includes(key)) return { type: "array", items: { type: "string" }, description };
  if (["p_limit", "p_offset", "limit", "itemCount", "days", "commentLikes"].includes(key)) return { type: ["integer", "null"], description };
  if (["p_paused", "withoutAccountOnly"].includes(key)) return { type: "boolean", description };
  if (/^p_(?:campaign|item|delivery|contact|draft|opportunity|cursor|client_request)_id$/.test(key) || key === "itemId") return { type: ["string", "null"], format: "uuid", description };
  if (/^p_(?:from|to|scheduled_at|expected_updated_at|cursor_updated_at|cursor_scheduled_at)$/.test(key) || ["startsAt", "endsAt", "expectedUpdatedAt"].includes(key)) return { type: ["string", "null"], format: "date-time", description };
  return { type: ["string", "null"], description };
}

function tool(endpoint: TokMarketingEndpoint, [operation, access, allowedArgs]: Definition): TokMarketingTool {
  const suffix = endpoint === "rpc" ? operation.replace(/^admin_/, "") : `${endpoint}_${operation}`;
  const name = `tok_marketing_${suffix.replace(/marketing_/g, "")}`;
  const requiresConfirmation = access !== "read";
  return {
    name, title: name.replace(/^tok_marketing_/, "").replace(/_/g, " "),
    description: `Marketing TOK: ${operation}. Requires an authenticated marketing administrator session with MFA. ${requiresConfirmation ? "Explicit user confirmation and a stable idempotency key are required. " : ""}The native marketing service validates permissions, revisions and publication readiness.`,
    endpoint, path: `/api/marketing/${endpoint}`, backendOperation: operation, access, requiresConfirmation, allowedArgs,
    inputSchema: {
      type: "object", additionalProperties: false,
      required: requiresConfirmation ? ["args", "confirmed_by_user", "idempotency_key"] : ["args"],
      properties: {
        args: { type: "object", description: "Arguments of this fixed native marketing operation. Supply only the named business fields; never provide authentication credentials.", properties: Object.fromEntries(allowedArgs.map((key) => [key, argumentSchema(key)])), additionalProperties: false },
        ...(requiresConfirmation ? {
          confirmed_by_user: { type: "boolean", const: true },
          idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9:_-]{7,119}$", description: "Stable key for one reviewed intent. Reuse this exact key and arguments for retries." },
        } : {}),
      },
    },
    annotations: { readOnlyHint: !requiresConfirmation, destructiveHint: requiresConfirmation, idempotentHint: true, openWorldHint: endpoint !== "rpc" },
  };
}

export const TOK_MARKETING_OPERATION_TOOLS: readonly TokMarketingTool[] = [
  ...rpcDefinitions.map((definition) => tool("rpc", definition)),
  ...agentDefinitions.map((definition) => tool("agent", definition)),
  ...orchestratorDefinitions.map((definition) => tool("orchestrator", definition)),
];

const forbiddenKeys = /^(?:__proto__|prototype|constructor|authorization|cookie|access_token|refresh_token|service_role_key|apikey|api_key|session|session_id|csrf|p_sid_hash|p_csrf_hash|x-marketing-actor-user-id)$/i;
function isRecord(value: unknown): value is Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Reject non-JSON values, excessive depth/size and credentials before any transport. */
function boundedJson(value: unknown, imageUpload: boolean): void {
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number, key = "") => {
    if (++nodes > 20_000 || depth > 12) throw new Error("tok_marketing_json_limit");
    if (entry === null || typeof entry === "boolean") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (typeof entry === "string") {
      const limit = imageUpload && depth === 1 && key === "imageBase64" ? 4 * 1024 * 1024 : 32_000;
      if (entry.length > limit) throw new Error("tok_marketing_string_limit");
      return;
    }
    if (typeof entry !== "object" || (!Array.isArray(entry) && !isRecord(entry)) || ancestors.has(entry)) throw new Error("tok_marketing_json_invalid");
    ancestors.add(entry);
    if (Array.isArray(entry)) {
      if (entry.length > 1000) throw new Error("tok_marketing_array_limit");
      for (const item of entry) visit(item, depth + 1);
    } else {
      for (const [field, item] of Object.entries(entry)) {
        if (field.length > 128 || forbiddenKeys.test(field)) throw new Error("tok_marketing_forbidden_argument");
        visit(item, depth + 1, field);
      }
    }
    ancestors.delete(entry);
  };
  visit(value, 0);
  const max = imageUpload ? 4 * 1024 * 1024 + 4096 : 256_000;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > max) throw new Error("tok_marketing_json_limit");
}

export function validateTokMarketingOperation(name: string, input: unknown): { tool: TokMarketingTool; args: Row; idempotencyKey?: string } {
  const selected = TOK_MARKETING_OPERATION_TOOLS.find((candidate) => candidate.name === name);
  if (!selected) throw new Error("tok_marketing_tool_not_found");
  if (!isRecord(input)) throw new Error("tok_marketing_arguments_invalid");
  const allowed = selected.requiresConfirmation ? ["args", "confirmed_by_user", "idempotency_key"] : ["args"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("tok_marketing_unknown_argument");
  if (!isRecord(input.args)) throw new Error("tok_marketing_arguments_invalid");
  if (Object.keys(input.args).some((key) => !selected.allowedArgs.includes(key))) throw new Error("tok_marketing_unknown_argument");
  if (selected.requiresConfirmation && input.confirmed_by_user !== true) throw new Error("tok_marketing_confirmation_required");
  if (selected.requiresConfirmation && (typeof input.idempotency_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:_-]{7,119}$/.test(input.idempotency_key))) throw new Error("tok_marketing_idempotency_required");
  boundedJson(input.args, selected.backendOperation === "upload_mailing_image");
  return { tool: selected, args: JSON.parse(JSON.stringify(input.args)) as Row, ...(selected.requiresConfirmation ? { idempotencyKey: input.idempotency_key as string } : {}) };
}

export function buildTokMarketingRequest(name: string, input: unknown) {
  const validated = validateTokMarketingOperation(name, input);
  const { tool: selected, args } = validated;
  const body: Row = selected.endpoint === "rpc" ? { operation: selected.backendOperation, args } : { ...args, action: selected.backendOperation };
  return { ...validated, endpoint: selected.endpoint, path: selected.path, body };
}
