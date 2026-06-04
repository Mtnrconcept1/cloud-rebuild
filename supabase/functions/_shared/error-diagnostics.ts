type ActorDiagnostic = {
  authMode?: string | null;
  roles?: string[] | null;
  isServiceRole?: boolean | null;
} | null | undefined;

function getStatus(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && Number.isFinite(status) ? status : 500;
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur interne";
}

export function getEdgeErrorDiagnostic(error: unknown, actor?: ActorDiagnostic) {
  const message = getMessage(error);
  const status = getStatus(error);
  const lowerMessage = message.toLowerCase();
  let code = status >= 500 ? "internal_error" : "request_error";
  let missingSecret: string | null = null;
  let recommendedAction = "Consulter les logs Edge Function et l'audit admin.";

  if (status === 401) {
    code = actor ? "session_expired" : "missing_authorization";
    recommendedAction = "Reconnecter l'utilisateur ou verifier le mode d'appel interne.";
  } else if (status === 403) {
    code = "role_failure";
    recommendedAction = "Verifier les roles, l'acces restaurant et le mode d'authentification.";
  } else if (lowerMessage.includes("firebase_service_account_missing")) {
    code = "missing_secret";
    missingSecret = "FIREBASE_SERVICE_ACCOUNT";
    recommendedAction = "Configurer FIREBASE_SERVICE_ACCOUNT ou les variables FIREBASE_* separees.";
  } else if (lowerMessage.includes("firebase_service_account_invalid")) {
    code = "firebase_config_invalid";
    missingSecret = "FIREBASE_SERVICE_ACCOUNT";
    recommendedAction = "Verifier le JSON Firebase, les retours ligne de la cle privee ou le format base64.";
  } else if (lowerMessage.includes("service_role_key") || lowerMessage.includes("service role")) {
    code = "missing_secret";
    missingSecret = "SUPABASE_SERVICE_ROLE_KEY";
    recommendedAction = "Verifier la synchronisation des secrets Edge Functions Supabase.";
  }

  return {
    code,
    status,
    auth_mode: actor?.authMode || null,
    actor_roles: actor?.roles || [],
    is_service_role: Boolean(actor?.isServiceRole),
    missing_secret: missingSecret,
    recommended_action: recommendedAction,
  };
}

export function getEdgeErrorPayload(error: unknown, actor?: ActorDiagnostic) {
  return {
    error: getMessage(error),
    diagnostic: getEdgeErrorDiagnostic(error, actor),
  };
}
