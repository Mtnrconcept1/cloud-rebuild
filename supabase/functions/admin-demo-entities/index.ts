import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  buildCorsHeaders,
  handleCorsPreflight,
  isRequestOriginAllowed,
} from "../_shared/cors.ts";

const FUNCTION_NAME = "admin-demo-entities";
const PRODUCTION_PROJECT_URL = "https://wwcrtyoueexyxkkikaos.supabase.co";
const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf";
const DEMO_PROJECT_URL = `https://${DEMO_PROJECT_REF}.supabase.co`;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASSWORD_MIN_LENGTH = 12;

type DemoAction = "list" | "create_user" | "create_restaurant" | "link";

type DemoUser = {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  restaurant_ids: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
};

type DemoRestaurant = {
  id: string;
  name: string;
  address: string;
  city: string;
  cuisine_type: string | null;
  owner_user_id: string | null;
  expected_owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  is_active: boolean;
  status: string;
  created_at: string | null;
};

function requireProductionRuntime() {
  if ((Deno.env.get("SUPABASE_URL") || "").trim() !== PRODUCTION_PROJECT_URL) {
    throw new HttpError(403, "This administration endpoint is production-only.");
  }
}

function getDemoAdminClient() {
  const url = (Deno.env.get("DEMO_SUPABASE_URL") || "").trim();
  const secretKey = (Deno.env.get("DEMO_SUPABASE_SECRET_KEY") || "").trim();
  const projectRef = (Deno.env.get("DEMO_SUPABASE_PROJECT_REF") || "").trim();

  if (url !== DEMO_PROJECT_URL || projectRef !== DEMO_PROJECT_REF || !secretKey) {
    throw new HttpError(503, "Dedicated TOK demo project is not configured.");
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength + 1)
    : "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, `${label} invalide.`);
  }
}

function assertEmail(email: string) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Adresse e-mail démo invalide.");
  }
}

function assertStrongPassword(password: unknown): asserts password is string {
  const value = typeof password === "string" ? password : "";
  if (
    value.length < PASSWORD_MIN_LENGTH
    || value.length > 128
    || !/[a-z]/.test(value)
    || !/[A-Z]/.test(value)
    || !/\d/.test(value)
    || !/[^A-Za-z0-9]/.test(value)
  ) {
    throw new HttpError(
      400,
      `Le mot de passe doit contenir ${PASSWORD_MIN_LENGTH} caractères minimum, avec majuscule, minuscule, chiffre et symbole.`,
    );
  }
}

function isExistingUserError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  const code = String(candidate?.code || "").toLowerCase();
  const message = String(candidate?.message || "").toLowerCase();
  return code === "email_exists"
    || code === "user_already_exists"
    || (Number(candidate?.status) === 422 && /(already|exists|registered|déjà)/i.test(message));
}

async function beginOperation(
  demo: ReturnType<typeof getDemoAdminClient>,
  input: { requestId: string; action: Exclude<DemoAction, "list">; actorUserId: string },
) {
  const { data, error } = await demo
    .from("demo_admin_operation_keys")
    .insert({
      request_id: input.requestId,
      action: input.action,
      actor_external_id: input.actorUserId,
      status: "processing",
    })
    .select("request_id,action,actor_external_id,status,response_payload,error_message")
    .single();

  if (!error) return { replay: false, row: data };
  if (error.code !== "23505") {
    throw new HttpError(503, "Impossible de réserver l'opération démo.");
  }

  const { data: existing, error: lookupError } = await demo
    .from("demo_admin_operation_keys")
    .select("request_id,action,actor_external_id,status,response_payload,error_message")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (lookupError || !existing) {
    throw new HttpError(503, "Impossible de vérifier l'opération démo existante.");
  }
  if (existing.action !== input.action || existing.actor_external_id !== input.actorUserId) {
    throw new HttpError(409, "Cette clé d'idempotence appartient à une autre opération.");
  }
  if (existing.status === "completed" && existing.response_payload) {
    return { replay: true, row: existing };
  }

  throw new HttpError(
    409,
    existing.status === "processing"
      ? "Cette opération démo est déjà en cours. Actualisez la liste dans quelques secondes."
      : "La précédente tentative a échoué. Relancez l'action depuis le formulaire.",
  );
}

async function completeOperation(
  demo: ReturnType<typeof getDemoAdminClient>,
  requestId: string,
  responsePayload: Record<string, unknown>,
) {
  const { error } = await demo
    .from("demo_admin_operation_keys")
    .update({
      status: "completed",
      response_payload: responsePayload,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
    .eq("status", "processing");

  if (error) throw new HttpError(503, "L'opération a réussi mais son résultat idempotent n'a pas pu être enregistré.");
}

async function failOperation(
  demo: ReturnType<typeof getDemoAdminClient>,
  requestId: string,
  message: string,
) {
  await demo
    .from("demo_admin_operation_keys")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
    .eq("status", "processing");
}

async function ensureDemoSystemOwner(demo: ReturnType<typeof getDemoAdminClient>) {
  const { data: existingState, error: stateError } = await demo
    .from("demo_admin_system_state")
    .select("unassigned_owner_id")
    .eq("singleton", true)
    .maybeSingle();
  if (stateError) throw new HttpError(503, "Impossible de vérifier l'état système démo.");

  let ownerId = existingState?.unassigned_owner_id || "";
  if (!ownerId) {
    const { data: created, error: createError } = await demo.auth.admin.createUser({
      email: `unassigned-restaurants-${crypto.randomUUID()}@demo.thetok.invalid`,
      email_confirm: true,
      app_metadata: { account_type: "demo_system", environment: "demo" },
      user_metadata: { full_name: "Restaurants démo non attribués" },
    });
    if (createError || !created?.user) {
      throw new HttpError(503, "Impossible de créer le propriétaire système démo.");
    }

    ownerId = created.user.id;
    const { error: insertStateError } = await demo
      .from("demo_admin_system_state")
      .insert({ singleton: true, unassigned_owner_id: ownerId });
    if (insertStateError?.code === "23505") {
      const { data: concurrentState, error: concurrentError } = await demo
        .from("demo_admin_system_state")
        .select("unassigned_owner_id")
        .eq("singleton", true)
        .single();
      await demo.auth.admin.deleteUser(ownerId);
      if (concurrentError || !concurrentState?.unassigned_owner_id) {
        throw new HttpError(503, "Impossible de résoudre le propriétaire système démo concurrent.");
      }
      ownerId = concurrentState.unassigned_owner_id;
    } else if (insertStateError) {
      await demo.auth.admin.deleteUser(ownerId);
      throw new HttpError(503, "Impossible d'enregistrer le propriétaire système démo.");
    }
  }

  const [profileResult, roleResult] = await Promise.all([
    demo.from("profiles").upsert(
      { user_id: ownerId, full_name: "Restaurants démo non attribués" },
      { onConflict: "user_id" },
    ),
    demo.from("user_roles").upsert(
      { user_id: ownerId, role: "client" },
      { onConflict: "user_id,role" },
    ),
  ]);

  if (profileResult.error || roleResult.error) {
    throw new HttpError(503, "Impossible de préparer le propriétaire système démo.");
  }
  return ownerId;
}

async function assertManagedDemoUser(
  demo: ReturnType<typeof getDemoAdminClient>,
  userId: string,
) {
  const { data, error } = await demo.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError(404, "Utilisateur démo introuvable.");
  if (
    String(data.user.app_metadata?.account_type || "") !== "restaurant_demo"
    || String(data.user.app_metadata?.environment || "") !== "demo"
    || String(data.user.app_metadata?.managed_by || "") !== "production_admin"
  ) {
    throw new HttpError(403, "Seul un compte restaurateur démo administré peut être lié.");
  }
  return data.user;
}

async function listDemoEnvironment(
  demo: ReturnType<typeof getDemoAdminClient>,
): Promise<{ users: DemoUser[]; restaurants: DemoRestaurant[] }> {
  const { data: authPage, error: authError } = await demo.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) throw new HttpError(503, "Impossible de lister les identités démo.");

  const authUsers = (authPage?.users || []).filter(
    (user) => String(user.app_metadata?.account_type || "") === "restaurant_demo"
      && String(user.app_metadata?.environment || "") === "demo"
      && String(user.app_metadata?.managed_by || "") === "production_admin",
  );
  const userIds = authUsers.map((user) => user.id);

  const { data: managedRows, error: managedError } = await demo
    .from("demo_admin_managed_restaurants")
    .select("restaurant_id")
    .order("created_at", { ascending: false });
  if (managedError) throw new HttpError(503, "La migration de gestion démo n'est pas disponible.");

  const restaurantIds = (managedRows || []).map((row) => row.restaurant_id);
  const [profilesResult, rolesResult, restaurantsResult, systemStateResult] = await Promise.all([
    userIds.length
      ? demo.from("profiles").select("user_id,full_name").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? demo.from("user_roles").select("user_id,role").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    restaurantIds.length
      ? demo.from("restaurants")
        .select("id,name,address,city,cuisine_type,owner_id,is_active,status,created_at,is_demo")
        .in("id", restaurantIds)
        .eq("is_demo", true)
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    demo.from("demo_admin_system_state")
      .select("unassigned_owner_id")
      .eq("singleton", true)
      .maybeSingle(),
  ]);

  if (profilesResult.error || rolesResult.error || restaurantsResult.error || systemStateResult.error) {
    throw new HttpError(503, "Impossible de charger les comptes et restaurants démo.");
  }

  const profileByUser = new Map(
    (profilesResult.data || []).map((profile) => [profile.user_id, profile]),
  );
  const authByUser = new Map(authUsers.map((user) => [user.id, user]));
  const rolesByUser = new Map<string, string[]>();
  for (const role of rolesResult.data || []) {
    const roles = rolesByUser.get(role.user_id) || [];
    roles.push(String(role.role));
    rolesByUser.set(role.user_id, roles);
  }

  const restaurantRows = restaurantsResult.data || [];
  const systemOwnerId = systemStateResult.data?.unassigned_owner_id || null;
  const users: DemoUser[] = authUsers.map((user) => ({
    user_id: user.id,
    full_name: profileByUser.get(user.id)?.full_name
      || String(user.user_metadata?.full_name || "Restaurateur démo"),
    email: user.email || null,
    roles: rolesByUser.get(user.id) || [],
    restaurant_ids: restaurantRows
      .filter((restaurant) => restaurant.owner_id === user.id)
      .map((restaurant) => restaurant.id),
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
  }));

  const restaurants: DemoRestaurant[] = restaurantRows.map((restaurant) => {
    const owner = restaurant.owner_id === systemOwnerId
      ? null
      : authByUser.get(restaurant.owner_id) || null;
    return {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      city: restaurant.city,
      cuisine_type: restaurant.cuisine_type,
      owner_user_id: owner?.id || null,
      expected_owner_id: restaurant.owner_id,
      owner_name: owner
        ? profileByUser.get(owner.id)?.full_name || String(owner.user_metadata?.full_name || "Restaurateur démo")
        : null,
      owner_email: owner?.email || null,
      is_active: restaurant.is_active === true,
      status: String(restaurant.status || "demo"),
      created_at: restaurant.created_at || null,
    };
  });

  return { users, restaurants };
}

async function createDemoUser(
  demo: ReturnType<typeof getDemoAdminClient>,
  body: Record<string, unknown>,
) {
  const fullName = normalizeText(body.full_name, 120);
  const email = normalizeEmail(body.email);
  assertEmail(email);
  assertStrongPassword(body.password);
  if (fullName.length < 2 || fullName.length > 120) {
    throw new HttpError(400, "Le nom doit contenir entre 2 et 120 caractères.");
  }

  const { data: created, error: createError } = await demo.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    app_metadata: {
      account_type: "restaurant_demo",
      environment: "demo",
      managed_by: "production_admin",
    },
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    if (isExistingUserError(createError)) {
      throw new HttpError(409, "Cette adresse existe déjà dans l'environnement démo.");
    }
    throw new HttpError(503, "Impossible de créer l'identité Auth démo.");
  }

  const userId = created.user.id;
  const [profileResult, rolesResult] = await Promise.all([
    demo.from("profiles").upsert(
      { user_id: userId, full_name: fullName },
      { onConflict: "user_id" },
    ),
    demo.from("user_roles").upsert(
      ["client", "restaurateur"].map((role) => ({ user_id: userId, role })),
      { onConflict: "user_id,role" },
    ),
  ]);

  if (profileResult.error || rolesResult.error) {
    await demo.auth.admin.deleteUser(userId);
    throw new HttpError(503, "Le compte démo a été annulé car ses rôles n'ont pas pu être créés.");
  }

  return {
    user: {
      user_id: userId,
      full_name: fullName,
      email,
      roles: ["client", "restaurateur"],
      restaurant_ids: [],
      created_at: created.user.created_at || null,
      last_sign_in_at: null,
    },
  };
}

async function createDemoRestaurant(
  demo: ReturnType<typeof getDemoAdminClient>,
  body: Record<string, unknown>,
  actorUserId: string,
) {
  const name = normalizeText(body.name, 120);
  const address = normalizeText(body.address, 240);
  const city = normalizeText(body.city, 100);
  const cuisineType = normalizeText(body.cuisine_type, 100);
  const phone = normalizeText(body.phone, 40);

  if (name.length < 2 || name.length > 120) {
    throw new HttpError(400, "Le nom du restaurant doit contenir entre 2 et 120 caractères.");
  }
  if (address.length < 3 || address.length > 240) {
    throw new HttpError(400, "L'adresse du restaurant démo est invalide.");
  }
  if (city.length < 2 || city.length > 100) {
    throw new HttpError(400, "La ville du restaurant démo est invalide.");
  }

  let ownerId = await ensureDemoSystemOwner(demo);
  if (body.owner_user_id) {
    assertUuid(body.owner_user_id, "Utilisateur démo");
    await assertManagedDemoUser(demo, body.owner_user_id);
    ownerId = body.owner_user_id;
  }

  const { data: restaurant, error: restaurantError } = await demo
    .from("restaurants")
    .insert({
      owner_id: ownerId,
      name,
      address,
      city,
      cuisine_type: cuisineType || null,
      phone: phone || null,
      is_demo: true,
      is_active: true,
      is_featured: false,
      status: "demo",
      supports_pickup: true,
      supports_dinein: true,
      supports_reservation: true,
      stripe_account_id: null,
      stripe_connect_details_submitted: false,
      stripe_connect_charges_enabled: false,
      stripe_connect_payouts_enabled: false,
    })
    .select("id,name,address,city,cuisine_type,owner_id,is_active,status,created_at")
    .single();

  if (restaurantError || !restaurant) {
    throw new HttpError(503, "Impossible de créer le restaurant dans le projet démo.");
  }

  const { error: markerError } = await demo
    .from("demo_admin_managed_restaurants")
    .insert({ restaurant_id: restaurant.id, created_by_external: actorUserId });

  if (markerError) {
    await demo.from("restaurants").delete().eq("id", restaurant.id);
    throw new HttpError(503, "Le restaurant démo a été annulé car son registre de gestion est indisponible.");
  }

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      city: restaurant.city,
      cuisine_type: restaurant.cuisine_type,
      owner_user_id: body.owner_user_id ? ownerId : null,
      expected_owner_id: ownerId,
      is_active: restaurant.is_active === true,
      status: String(restaurant.status || "demo"),
      created_at: restaurant.created_at || null,
    },
  };
}

async function linkDemoUserRestaurant(
  demo: ReturnType<typeof getDemoAdminClient>,
  body: Record<string, unknown>,
  actorUserId: string,
) {
  assertUuid(body.user_id, "Utilisateur démo");
  assertUuid(body.restaurant_id, "Restaurant démo");
  assertUuid(body.expected_owner_id, "Propriétaire attendu");
  const reason = normalizeText(body.reason, 500);
  if (reason.length < 3 || reason.length > 500) {
    throw new HttpError(400, "Un motif de liaison de 3 à 500 caractères est requis.");
  }

  await assertManagedDemoUser(demo, body.user_id);
  const { data, error } = await demo.rpc("demo_admin_link_restaurant_owner", {
    p_actor_external_id: actorUserId,
    p_user_id: body.user_id,
    p_restaurant_id: body.restaurant_id,
    p_expected_owner_id: body.expected_owner_id,
    p_reason: reason,
  });
  if (error) throw new HttpError(error.code === "40001" ? 409 : 400, error.message);
  return { link: data };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let demo: ReturnType<typeof getDemoAdminClient> | null = null;
  let action: DemoAction = "list";
  let requestId: string | null = null;
  let operationStarted = false;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    if (!isRequestOriginAllowed(req)) throw new HttpError(403, "Origin not allowed.");
    requireProductionRuntime();

    actor = await authenticateRequest(req);
    await assertProductionFlowAllowed(actor, "administration de l'environnement démo");
    requireUserRole(actor, ["admin"]);
    if (!actor.userId) throw new HttpError(403, "Administrator identity required.");

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Corps JSON invalide.");

    action = String(body.action || "list") as DemoAction;
    if (!["list", "create_user", "create_restaurant", "link"].includes(action)) {
      throw new HttpError(400, "Action démo invalide.");
    }

    demo = getDemoAdminClient();
    if (action === "list") {
      const environment = await listDemoEnvironment(demo);
      return jsonResponse({ ok: true, project_ref: DEMO_PROJECT_REF, ...environment }, 200, {
        ...corsHeaders,
        "Cache-Control": "no-store",
      });
    }

    assertUuid(body.request_id, "Clé d'idempotence");
    requestId = body.request_id;
    const operation = await beginOperation(demo, {
      requestId,
      action,
      actorUserId: actor.userId,
    });
    if (operation.replay) {
      return jsonResponse({
        ok: true,
        replayed: true,
        ...(operation.row.response_payload as Record<string, unknown>),
      }, 200, { ...corsHeaders, "Cache-Control": "no-store" });
    }
    operationStarted = true;

    const result = action === "create_user"
      ? await createDemoUser(demo, body)
      : action === "create_restaurant"
        ? await createDemoRestaurant(demo, body, actor.userId)
        : await linkDemoUserRestaurant(demo, body, actor.userId);

    await completeOperation(demo, requestId, result);
    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: action === "create_user" ? "demo_user" : "demo_restaurant",
      targetEntityId: String(
        (result as { user?: { user_id?: string }; restaurant?: { id?: string }; link?: { restaurant_id?: string } })
          .user?.user_id
        || (result as { restaurant?: { id?: string } }).restaurant?.id
        || (result as { link?: { restaurant_id?: string } }).link?.restaurant_id
        || "",
      ) || null,
      metadata: { demo_project_ref: DEMO_PROJECT_REF, request_id: requestId },
    });

    return jsonResponse({ ok: true, ...result }, 201, {
      ...corsHeaders,
      "Cache-Control": "no-store",
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error.";

    if (operationStarted && demo && requestId) {
      await failOperation(demo, requestId, message);
    }
    if (actor && action !== "list") {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action,
        actor,
        request: req,
        errorMessage: message,
        metadata: { demo_project_ref: DEMO_PROJECT_REF, request_id: requestId },
      });
    }

    return jsonResponse({ ok: false, error: message }, status, {
      ...corsHeaders,
      "Cache-Control": "no-store",
    });
  }
});
