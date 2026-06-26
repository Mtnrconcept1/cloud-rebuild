import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { HttpError, jsonResponse } from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  SAFE_TOK_CONNECT_MCP_TOOLS,
  buildTokConnectEnvelope,
  getTokConnectSandboxMcpToolResult,
  makeTokConnectRequestId,
} from "../_shared/tok-connect.ts";
import {
  assertTokConnectFeatureEnabled,
  assertTokConnectRestaurantGrant,
  authenticateTokConnectToken,
  recordTokConnectApiRequest,
  type TokConnectTokenContext,
} from "../_shared/tok-connect-auth.ts";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpHandleResult = {
  payload: Record<string, unknown>;
  context: TokConnectTokenContext | null;
  route: string;
  scopes: string[];
};

const MCP_RESOURCES = [
  {
    uri: "tok://restaurants",
    name: "TOK restaurants",
    description: "Restaurant discovery catalog exposed through TOK Connect.",
    mimeType: "application/json",
  },
  {
    uri: "tok://availability/{restaurant_id}",
    name: "Restaurant availability",
    description: "Real-time reservation slot availability for an authorized restaurant.",
    mimeType: "application/json",
  },
  {
    uri: "tok://campaign-preview/{restaurant_id}",
    name: "Campaign preview",
    description: "Human-approved campaign preview context.",
    mimeType: "application/json",
  },
];

const MCP_PROMPTS = [
  {
    name: "prepare_guest_reservation",
    description: "Turn a guest request into a confirmation-ready TOK reservation preview.",
    arguments: [
      { name: "city", required: true },
      { name: "party_size", required: true },
      { name: "date", required: true },
      { name: "time", required: false },
    ],
  },
  {
    name: "restaurant_campaign_preview",
    description: "Prepare a campaign proposal that still requires restaurant validation.",
    arguments: [
      { name: "restaurant_id", required: true },
      { name: "objective", required: true },
      { name: "budget_chf", required: false },
    ],
  },
];

function rpcResult(id: JsonRpcRequest["id"], result: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function authorizeMcp(req: Request, requiredScopes: string[] = []) {
  const context = await authenticateTokConnectToken(req, requiredScopes);
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect");
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-mcp");
  const limiter = createRateLimiter(context.adminClient, "tok-connect-mcp");
  await limiter.consume(`partner:${context.partnerId}`, { maxRequests: 300, windowSeconds: 60 });
  return context;
}

function toolDefinition(tool: typeof SAFE_TOK_CONNECT_MCP_TOOLS[number]) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

async function callTool(
  context: TokConnectTokenContext,
  name: string,
  args: Record<string, unknown>,
) {
  const restaurantId = typeof args.restaurant_id === "string" ? args.restaurant_id : "";
  if (context.environment === "sandbox") {
    const sandboxResult = getTokConnectSandboxMcpToolResult(name, args);
    if (sandboxResult) return sandboxResult;
  }

  switch (name) {
    case "search_restaurants": {
      const limit = Math.min(Number(args.limit || 10), 25);
      if (context.environment === "sandbox") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              restaurants: [
                { id: "00000000-0000-4000-8000-000000000101", name: "TOK Sandbox Brasserie", city: args.city || "Genève" },
              ],
            }),
          }],
        };
      }

      const { data, error } = await context.adminClient
        .from("restaurants")
        .select("id, name, cuisine_type, city, rating, supports_reservation")
        .eq("is_active", true)
        .order("rating", { ascending: false })
        .limit(limit);

      if (error) throw new HttpError(500, error.message);
      return { content: [{ type: "text", text: JSON.stringify({ restaurants: data || [] }) }] };
    }

    case "get_real_time_availability": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "availability:read", {
        requireMcp: true,
        partySize: Number(args.party_size || 0) || null,
      });
      const { data, error } = await context.adminClient.rpc("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: args.restaurant_id,
        p_date: args.date,
      });
      if (error) throw new HttpError(500, error.message);
      return { content: [{ type: "text", text: JSON.stringify({ slots: data || [] }) }] };
    }

    case "prepare_reservation":
      await assertTokConnectRestaurantGrant(context, restaurantId, "reservations:create", {
        requireMcp: true,
        partySize: Number(args.party_size || 0) || null,
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            reservation_preview: {
              restaurant_id: args.restaurant_id,
              date: args.date,
              time: args.time,
              party_size: args.party_size,
              requires_confirmation: true,
            },
          }),
        }],
      };

    case "get_restaurant_performance": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "analytics:read", {
        requireMcp: true,
      });
      const { data, error } = await context.adminClient.rpc("get_restaurant_performance", {
        p_restaurant_id: args.restaurant_id,
        p_period_days: args.period === "90d" ? 90 : args.period === "7d" ? 7 : 30,
      });
      if (error) throw new HttpError(500, error.message);
      return { content: [{ type: "text", text: JSON.stringify({ performance: data }) }] };
    }

    case "estimate_campaign_credit_cost":
      await assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview", {
        requireMcp: true,
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            estimate: {
              restaurant_id: args.restaurant_id,
              credits: Math.max(1, Math.ceil(Number(args.audience_size || 100) / 100)),
              currency: "TOK_CREDIT",
            },
          }),
        }],
      };

    case "generate_campaign_preview": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview", {
        requireMcp: true,
      });
      const preview = {
        restaurant_id: args.restaurant_id,
        objective: args.objective,
        budget_chf: Number(args.budget_chf || 0),
        requires_human_approval: true,
        status: "preview",
      };
      await context.adminClient.from("tok_connect_agent_runs").insert({
        partner_id: context.partnerId,
        restaurant_id: args.restaurant_id,
        mode: "preview",
        tool_name: "generate_campaign_preview",
        status: "preview",
        scopes: ["campaigns:preview"],
        input: args,
        output: { campaign_preview: preview },
        approval_required: true,
      });
      return { content: [{ type: "text", text: JSON.stringify({ campaign_preview: preview }) }] };
    }

    default:
      throw new HttpError(404, "mcp_tool_not_found");
  }
}

async function handleMcp(req: Request, rpc: JsonRpcRequest): Promise<McpHandleResult> {
  switch (rpc.method) {
    case "initialize": {
      const context = await authorizeMcp(req);
      return {
        payload: rpcResult(rpc.id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "tok-connect-mcp", version: "1.0.0" },
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        }),
        context,
        route: "MCP initialize",
        scopes: [],
      };
    }

    case "tools/list": {
      const context = await authorizeMcp(req);
      return {
        payload: rpcResult(rpc.id, { tools: SAFE_TOK_CONNECT_MCP_TOOLS.map(toolDefinition) }),
        context,
        route: "MCP tools/list",
        scopes: [],
      };
    }

    case "tools/call": {
      const toolName = String(rpc.params?.name || "");
      const tool = SAFE_TOK_CONNECT_MCP_TOOLS.find((entry) => entry.name === toolName);
      if (!tool) throw new HttpError(404, "mcp_tool_not_found");
      const context = await authorizeMcp(req, tool.requiredScopes);
      const result = await callTool(context, toolName, (rpc.params?.arguments || {}) as Record<string, unknown>);
      return {
        payload: rpcResult(rpc.id, result),
        context,
        route: `MCP tools/call ${toolName}`,
        scopes: tool.requiredScopes,
      };
    }

    case "resources/list": {
      const context = await authorizeMcp(req);
      return {
        payload: rpcResult(rpc.id, { resources: MCP_RESOURCES }),
        context,
        route: "MCP resources/list",
        scopes: [],
      };
    }

    case "resources/read": {
      const uri = String(rpc.params?.uri || "tok://restaurants");
      let context: TokConnectTokenContext;
      let scopes: string[];
      if (uri.startsWith("tok://availability/")) {
        scopes = ["availability:read"];
        context = await authorizeMcp(req, scopes);
        await assertTokConnectRestaurantGrant(
          context,
          uri.replace("tok://availability/", ""),
          "availability:read",
          { requireMcp: true },
        );
      } else if (uri.startsWith("tok://campaign-preview/")) {
        scopes = ["campaigns:preview"];
        context = await authorizeMcp(req, scopes);
        await assertTokConnectRestaurantGrant(
          context,
          uri.replace("tok://campaign-preview/", ""),
          "campaigns:preview",
          { requireMcp: true },
        );
      } else {
        scopes = ["restaurants:read"];
        context = await authorizeMcp(req, scopes);
      }
      return {
        payload: rpcResult(rpc.id, {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ status: "available", mutation_allowed: false }),
        }],
        }),
        context,
        route: "MCP resources/read",
        scopes,
      };
    }

    case "prompts/list": {
      const context = await authorizeMcp(req);
      return {
        payload: rpcResult(rpc.id, { prompts: MCP_PROMPTS }),
        context,
        route: "MCP prompts/list",
        scopes: [],
      };
    }

    case "prompts/get": {
      const context = await authorizeMcp(req);
      const name = String(rpc.params?.name || "");
      const prompt = MCP_PROMPTS.find((entry) => entry.name === name);
      if (!prompt) throw new HttpError(404, "mcp_prompt_not_found");
      return {
        payload: rpcResult(rpc.id, {
        description: prompt.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `${prompt.description} Use TOK Connect scopes and return a preview before any real mutation.`,
          },
        }],
        }),
        context,
        route: `MCP prompts/get ${name}`,
        scopes: [],
      };
    }

    default:
      throw new HttpError(404, "mcp_method_not_found");
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  const startedAt = Date.now();
  let context: TokConnectTokenContext | null = null;
  let statusCode = 200;
  let errorCode: string | null = null;
  let route = "tok-connect-mcp";
  let scopes: string[] = [];
  let rpc: JsonRpcRequest = {};

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    rpc = await req.json().catch(() => ({})) as JsonRpcRequest;
    const result = await handleMcp(req, rpc);
    context = result.context;
    route = result.route;
    scopes = result.scopes;
    return jsonResponse(result.payload, 200, corsHeaders);
  } catch (error) {
    statusCode = error instanceof HttpError ? error.status : 500;
    errorCode = error instanceof Error ? error.message : "tok_connect_mcp_error";
    return jsonResponse(
      rpcError(rpc.id ?? null, statusCode === 404 ? -32601 : -32000, errorCode),
      statusCode,
      corsHeaders,
    );
  } finally {
    await recordTokConnectApiRequest({
      context,
      request: req,
      requestId,
      route,
      statusCode,
      startedAt,
      scopes,
      errorCode,
    });
  }
});

export const tokConnectMcpHealthEnvelope = buildTokConnectEnvelope({
  requestId: "tok_mcp_static",
  data: { server: "tok-connect-mcp" },
});
