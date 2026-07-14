import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger, maskEmail } from "../_shared/logging.ts";

type CreateCommercialAccountBody = {
  action: "create";
  full_name: string;
  email: string;
  password: string;
};

type ResetCommercialPasswordBody = {
  action: "reset_password";
  user_id: string;
  password: string;
};

type RequestBody =
  | CreateCommercialAccountBody
  | ResetCommercialPasswordBody
  | { action: "list" };

const PASSWORD_MIN_LENGTH = 12;

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function assertStrongPassword(password: unknown): asserts password is string {
  const value = typeof password === "string" ? password : "";
  const isStrong = value.length >= PASSWORD_MIN_LENGTH
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);

  if (!isStrong) {
    throw new HttpError(
      400,
      `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères, avec majuscule, minuscule, chiffre et symbole.`,
    );
  }
}

function assertValidEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, "Identifiant e-mail invalide.");
  }
}

function assertValidUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, "Identifiant de compte invalide.");
  }
}

function authErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message && message !== "{}" && message !== "[object Object]") return message;
  }

  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function isExistingAuthUserError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = String(authError.code || "").toLowerCase();
  const message = String(authError.message || "").toLowerCase();
  const status = Number(authError.status);

  return code === "email_exists"
    || code === "user_already_exists"
    || (status === 422 && /(already|exists|registered|déjà)/i.test(message));
}

async function getAuthUsersById(adminClient: any, userIds: string[]) {
  const usersById = new Map<string, any>();
  const batchSize = 10;

  for (let index = 0; index < userIds.length; index += batchSize) {
    const batch = userIds.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map((userId) => adminClient.auth.admin.getUserById(userId)),
    );

    results.forEach((result: any, resultIndex: number) => {
      if (!result.error && result.data?.user) {
        usersById.set(batch[resultIndex], result.data.user);
      }
    });
  }

  return usersById;
}

async function rollbackCreatedAuthUser(adminClient: any, userId: string, log: any) {
  try {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (!deleteError) return { deleted: true, banned: false, error: null };

    const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    log.error("commercial_auth_rollback_failed", {
      target_user_id: userId,
      delete_error: deleteError.message,
      ban_error: banError?.message || null,
      severity: "critical",
    });
    return {
      deleted: false,
      banned: !banError,
      error: banError?.message || deleteError.message,
    };
  } catch (error) {
    log.error("commercial_auth_rollback_failed", {
      target_user_id: userId,
      error: error instanceof Error ? error.message : "unknown",
      severity: "critical",
    });
    return {
      deleted: false,
      banned: false,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

async function listManagedAccounts(adminClient: any) {
  const { data: mappings, error: mappingError } = await adminClient
    .from("commercial_demo_accounts")
    .select("user_id,demo_restaurant_id,is_active,template_version,last_password_reset_at,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (mappingError) throw new HttpError(500, mappingError.message);
  if (!mappings?.length) return [];

  const userIds = mappings.map((entry: any) => entry.user_id);
  const restaurantIds = mappings.map((entry: any) => entry.demo_restaurant_id);

  const [profilesResult, restaurantsResult, rolesResult, authByUser] = await Promise.all([
    adminClient.from("profiles").select("user_id,full_name").in("user_id", userIds),
    adminClient.from("restaurants").select("id,name,is_demo,is_active,status").in("id", restaurantIds),
    adminClient.from("user_roles").select("user_id,role").in("user_id", userIds),
    getAuthUsersById(adminClient, userIds),
  ]);

  if (profilesResult.error) throw new HttpError(500, profilesResult.error.message);
  if (restaurantsResult.error) throw new HttpError(500, restaurantsResult.error.message);
  if (rolesResult.error) throw new HttpError(500, rolesResult.error.message);

  const profilesByUser = new Map(
    (profilesResult.data || []).map((entry: any) => [entry.user_id, entry]),
  );
  const restaurantsById = new Map(
    (restaurantsResult.data || []).map((entry: any) => [entry.id, entry]),
  );
  const rolesByUser = new Map<string, string[]>();

  for (const row of rolesResult.data || []) {
    const current = rolesByUser.get(row.user_id) || [];
    current.push(String(row.role));
    rolesByUser.set(row.user_id, current);
  }

  return mappings.map((mapping: any) => {
    const authUser = authByUser.get(mapping.user_id);
    const restaurant = restaurantsById.get(mapping.demo_restaurant_id);
    const profile = profilesByUser.get(mapping.user_id);
    const bannedUntil = Date.parse(String(authUser?.banned_until || ""));
    const isCurrentlyBanned = Number.isFinite(bannedUntil) && bannedUntil > Date.now();

    return {
      user_id: mapping.user_id,
      full_name: profile?.full_name || authUser?.user_metadata?.full_name || "Commercial TOK",
      email: authUser?.email || null,
      roles: rolesByUser.get(mapping.user_id) || [],
      created_at: mapping.created_at,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      last_password_reset_at: mapping.last_password_reset_at,
      enabled: Boolean(mapping.is_active && authUser && !isCurrentlyBanned),
      template_version: mapping.template_version,
      demo_restaurant: restaurant
        ? {
          id: restaurant.id,
          name: restaurant.name,
          is_demo: restaurant.is_demo,
          is_active: restaurant.is_active,
          status: restaurant.status,
        }
        : null,
    };
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("provision-commercial-accounts");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action = "unknown";
  let targetUserId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    actor = await authenticateRequest(req);
    requireUserRole(actor, ["admin"]);

    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      throw new HttpError(400, "Corps JSON invalide.");
    }
    action = typeof body?.action === "string" ? body.action : "list";

    if (action === "list") {
      const accounts = await listManagedAccounts(actor.adminClient);
      return jsonResponse({ ok: true, accounts }, 200, corsHeaders);
    }

    if (action === "create") {
      const createBody = body as CreateCommercialAccountBody;
      const fullName = normalizeName(createBody.full_name);
      const email = normalizeEmail(createBody.email);
      assertStrongPassword(createBody.password);
      assertValidEmail(email);

      if (fullName.length < 2 || fullName.length > 120) {
        throw new HttpError(400, "Le nom doit contenir entre 2 et 120 caractères.");
      }

      const { data: createdUser, error: createError } = await actor.adminClient.auth.admin.createUser({
        email,
        password: createBody.password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: {
          account_type: "commercial_demo",
          managed_by: "admin",
        },
      });

      if (createError || !createdUser?.user) {
        if (isExistingAuthUserError(createError)) {
          throw new HttpError(
            409,
            "Cet identifiant existe déjà. Aucun mot de passe ni rôle n'a été modifié.",
          );
        }

        throw new HttpError(
          500,
          authErrorMessage(createError, "Impossible de créer le compte Auth."),
        );
      }

      targetUserId = createdUser.user.id;
      if (!actor.userClient) {
        const rollback = await rollbackCreatedAuthUser(actor.adminClient, targetUserId, log);
        if (rollback.deleted) targetUserId = null;
        throw new HttpError(403, "Une session administrateur est requise.");
      }

      const { data: provisioned, error: provisionError } = await actor.userClient.rpc(
        "provision_commercial_demo_account",
        {
          p_user_id: targetUserId,
          p_full_name: fullName,
          p_email: email,
        },
      );

      if (provisionError) {
        const provisionErrorMessage = authErrorMessage(
          provisionError,
          "Impossible de préparer le restaurant de démonstration.",
        );
        // Hard-delete only the Auth user created by this request so the e-mail
        // can be reused after a failed database provisioning transaction.
        const failedUserId = targetUserId;
        const rollback = await rollbackCreatedAuthUser(actor.adminClient, failedUserId, log);
        if (rollback.deleted) {
          targetUserId = null;
          throw new HttpError(500, `Le compte Auth a été annulé: ${provisionErrorMessage}`);
        }

        throw new HttpError(
          500,
          `Le provisioning a échoué. Le compte Auth ${failedUserId} a été ${rollback.banned ? "bloqué" : "signalé pour intervention manuelle"}.`,
        );
      }

      log.info("managed_commercial_account_created", {
        actor_user_id: actor.userId,
        target_user_id: targetUserId,
        email: maskEmail(email),
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "provision-commercial-accounts",
        action: "create",
        status: "success",
        targetEntityType: "commercial_demo_account",
        targetEntityId: targetUserId,
        metadata: {
          roles: ["client", "commercial", "restaurateur"],
          demo_restaurant_id: provisioned?.restaurant_id || null,
        },
      });

      return jsonResponse({
        ok: true,
        account: {
          user_id: targetUserId,
          full_name: fullName,
          email,
          roles: ["client", "commercial", "restaurateur"],
          demo_restaurant_id: provisioned?.restaurant_id || null,
          demo_restaurant_name: provisioned?.restaurant_name || null,
        },
      }, 201, corsHeaders);
    }

    if (action === "reset_password") {
      const resetBody = body as ResetCommercialPasswordBody;
      targetUserId = typeof resetBody.user_id === "string" ? resetBody.user_id.trim() : "";
      assertStrongPassword(resetBody.password);
      assertValidUuid(targetUserId);

      const { data: managedAccount, error: managedError } = await actor.adminClient
        .from("commercial_demo_accounts")
        .select("user_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (managedError) throw new HttpError(500, managedError.message);
      if (!managedAccount) throw new HttpError(404, "Compte commercial géré introuvable.");

      const { error: passwordError } = await actor.adminClient.auth.admin.updateUserById(
        targetUserId,
        { password: resetBody.password },
      );
      if (passwordError) {
        throw new HttpError(
          500,
          authErrorMessage(passwordError, "Impossible de remplacer le mot de passe Auth."),
        );
      }

      const { error: resetAuditError } = await actor.adminClient
        .from("commercial_demo_accounts")
        .update({ last_password_reset_at: new Date().toISOString() })
        .eq("user_id", targetUserId);
      const auditWarning = resetAuditError
        ? `Mot de passe remplacé, mais horodatage non enregistré: ${resetAuditError.message}`
        : null;

      if (auditWarning) {
        log.error("commercial_password_reset_audit_warning", {
          actor_user_id: actor.userId,
          target_user_id: targetUserId,
          message: auditWarning,
        });
      }

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "provision-commercial-accounts",
        action: "reset_password",
        status: "success",
        targetEntityType: "commercial_demo_account",
        targetEntityId: targetUserId,
        metadata: auditWarning ? { audit_warning: auditWarning } : {},
      });

      return jsonResponse({ ok: true, audit_warning: auditWarning }, 200, corsHeaders);
    }

    throw new HttpError(400, "Action inconnue.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Internal error";

    log.error("managed_commercial_account_action_failed", {
      action,
      actor_user_id: actor?.userId || null,
      target_user_id: targetUserId,
      message,
    });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "provision-commercial-accounts",
        action,
        status: "failure",
        targetEntityType: "commercial_demo_account",
        targetEntityId: targetUserId,
        errorMessage: message,
      });
    }

    return jsonResponse({
      ok: false,
      error: message,
      ...(targetUserId ? { target_user_id: targetUserId } : {}),
    }, status, corsHeaders);
  }
});
