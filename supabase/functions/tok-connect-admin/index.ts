import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function buildAdminOverview(adminClient: ReturnType<typeof createAdminClient>) {
  const [restaurantsResult, partnersResult, clientsResult, runsResult, requestsResult] = await Promise.all([
    adminClient
      .from("restaurants")
      .select("id, name, city, address, owner_id, status, is_active, is_demo, tok_connect_mcp_enabled")
      .eq("is_demo", false)
      .order("name", { ascending: true })
      .limit(1500),
    adminClient
      .from("tok_connect_partners")
      .select("id, name, slug, status, environment, contact_email, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    adminClient
      .from("tok_connect_clients")
      .select("id, partner_id, name, client_id, status, environment, allowed_scopes, created_at, last_used_at")
      .order("created_at", { ascending: false })
      .limit(150),
    adminClient
      .from("tok_connect_agent_runs")
      .select("id, partner_id, client_id, restaurant_id, tool_name, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
    adminClient
      .from("tok_connect_api_requests")
      .select("id, partner_id, client_id, restaurant_id, route, status_code, error_code, created_at, request_metadata")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const firstError = [
    restaurantsResult.error,
    partnersResult.error,
    clientsResult.error,
    runsResult.error,
    requestsResult.error,
  ].find(Boolean);
  if (firstError) throw new HttpError(500, firstError.message);

  const restaurants = restaurantsResult.data || [];
  const partners = partnersResult.data || [];
  const clients = clientsResult.data || [];
  const agentRuns = runsResult.data || [];
  const requests = requestsResult.data || [];

  const ownerIds = [...new Set(restaurants.map((row: any) => stringValue(row.owner_id)).filter(Boolean))];
  const profilesResult = ownerIds.length
    ? await adminClient.from("profiles").select("user_id, full_name").in("user_id", ownerIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new HttpError(500, profilesResult.error.message);

  const profileByUser = new Map(
    (profilesResult.data || []).map((profile: any) => [stringValue(profile.user_id), stringValue(profile.full_name)]),
  );

  // Auth remains the source of truth for account email. The admin overview only
  // exposes it to an authenticated TOK admin and never returns password/session data.
  const authByUser = new Map<string, { email: string; fullName: string }>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new HttpError(500, error.message);
    const users = data?.users || [];
    for (const user of users) {
      if (!ownerIds.includes(user.id)) continue;
      const metadata = asRecord(user.user_metadata);
      authByUser.set(user.id, {
        email: stringValue(user.email),
        fullName: stringValue(metadata.full_name) || stringValue(metadata.name),
      });
    }
    if (users.length < 100 || authByUser.size >= ownerIds.length) break;
  }

  const partnerById = new Map(partners.map((partner: any) => [stringValue(partner.id), partner]));
  const clientById = new Map(clients.map((client: any) => [stringValue(client.id), client]));
  const restaurantById = new Map(restaurants.map((restaurant: any) => [stringValue(restaurant.id), restaurant]));

  const humanRestaurants = restaurants.map((restaurant: any) => {
    const ownerId = stringValue(restaurant.owner_id);
    const authUser = authByUser.get(ownerId);
    return {
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name || "Restaurant sans nom",
      restaurant_city: restaurant.city || null,
      restaurant_address: restaurant.address || null,
      owner_name: profileByUser.get(ownerId) || authUser?.fullName || authUser?.email || "Propriétaire non renseigné",
      owner_email: authUser?.email || null,
      mcp_enabled: restaurant.tok_connect_mcp_enabled !== false,
      restaurant_status: restaurant.status || null,
      restaurant_active: restaurant.is_active === true,
    };
  });

  const humanAgents = clients.map((client: any) => {
    const partner = partnerById.get(stringValue(client.partner_id)) as any;
    return {
      agent_id: client.id,
      agent_name: client.name || "Application TOK Connect",
      partner_name: partner?.name || "TOK Connect",
      status: client.status || "unknown",
      environment: client.environment || null,
      last_used_at: client.last_used_at || null,
      allowed_scopes: Array.isArray(client.allowed_scopes) ? client.allowed_scopes : [],
    };
  });

  const humanRuns = agentRuns.map((run: any) => {
    const partner = partnerById.get(stringValue(run.partner_id)) as any;
    const client = clientById.get(stringValue(run.client_id)) as any;
    const restaurant = restaurantById.get(stringValue(run.restaurant_id)) as any;
    return {
      run_id: run.id,
      agent_name: client?.name || partner?.name || "Agent TOK Connect",
      partner_name: partner?.name || "TOK Connect",
      restaurant_name: restaurant?.name || null,
      tool_name: run.tool_name || null,
      status: run.status || null,
      created_at: run.created_at || null,
      updated_at: run.updated_at || null,
    };
  });

  const humanActivity = requests.map((request: any) => {
    const partner = partnerById.get(stringValue(request.partner_id)) as any;
    const client = clientById.get(stringValue(request.client_id)) as any;
    const restaurant = restaurantById.get(stringValue(request.restaurant_id)) as any;
    const metadata = asRecord(request.request_metadata);
    return {
      request_id: request.id,
      agent_name: client?.name || (metadata.auth_mode === "supabase_oauth" ? "ChatGPT / TOK Connect" : "TOK Connect"),
      partner_name: partner?.name || (metadata.auth_mode === "supabase_oauth" ? "OAuth TOK" : "TOK Connect"),
      restaurant_name: restaurant?.name || null,
      route: request.route || null,
      status_code: request.status_code || null,
      error_code: request.error_code || null,
      created_at: request.created_at || null,
    };
  });

  return {
    restaurants: humanRestaurants,
    agents: humanAgents,
    runs: humanRuns,
    activity: humanActivity,
    technical: {
      partners: partners.map((partner: any) => ({
        partner_id: partner.id,
        partner_name: partner.name,
        status: partner.status,
        environment: partner.environment,
      })),
      agents: clients.map((client: any) => ({
        agent_id: client.id,
        public_client_id: client.client_id,
        agent_name: client.name,
        partner_id: client.partner_id,
      })),
    },
  };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const adminClient = createAdminClient();
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req);
    requireRole(actor, ["admin"]);

    const body = asRecord(await req.json().catch(() => ({})));
    const action = stringValue(body.action).toLowerCase();

    if (action === "admin-overview") {
      return jsonResponse({ ok: true, data: await buildAdminOverview(adminClient), error: null }, 200, cors);
    }

    if (action === "set-restaurant-mcp-access") {
      const restaurantId = stringValue(body.restaurant_id);
      if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
      if (typeof body.enabled !== "boolean") throw new HttpError(400, "enabled doit être un booléen");

      const { data: current, error: currentError } = await adminClient
        .from("restaurants")
        .select("id, name, tok_connect_mcp_enabled")
        .eq("id", restaurantId)
        .eq("is_demo", false)
        .maybeSingle();
      if (currentError) throw new HttpError(500, currentError.message);
      if (!current) throw new HttpError(404, "Restaurant introuvable");

      const { data: updated, error: updateError } = await adminClient
        .from("restaurants")
        .update({ tok_connect_mcp_enabled: body.enabled })
        .eq("id", restaurantId)
        .select("id, name, tok_connect_mcp_enabled")
        .single();
      if (updateError) throw new HttpError(500, updateError.message);

      if (body.enabled === false) {
        // Legacy partner grants stay auditable but cannot keep MCP access alive
        // after a global Admin revocation.
        const { error: grantError } = await adminClient
          .from("tok_connect_restaurant_grants")
          .update({ allow_mcp: false, updated_at: new Date().toISOString() })
          .eq("restaurant_id", restaurantId)
          .neq("status", "revoked");
        if (grantError) throw new HttpError(500, grantError.message);
      }

      await writeAuditLog({
        adminClient,
        actor,
        request: req,
        functionName: "tok-connect-admin",
        action: body.enabled ? "authorize_restaurant_mcp" : "revoke_restaurant_mcp",
        status: "success",
        targetEntityType: "restaurant",
        targetEntityId: restaurantId,
        metadata: {
          restaurant_name: updated.name,
          previous_enabled: current.tok_connect_mcp_enabled !== false,
          mcp_enabled: updated.tok_connect_mcp_enabled !== false,
        },
      });

      return jsonResponse({
        ok: true,
        data: {
          restaurant_id: updated.id,
          restaurant_name: updated.name,
          mcp_enabled: updated.tok_connect_mcp_enabled !== false,
        },
        error: null,
      }, 200, cors);
    }

    throw new HttpError(400, "Action TOK Connect Admin inconnue");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur TOK Connect Admin";
    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "tok-connect-admin",
      action: "admin",
      status: "failure",
      errorMessage: message,
    });
    return jsonResponse({ ok: false, data: null, error: { code: "tok_connect_admin_error", message } }, status, cors);
  }
});
