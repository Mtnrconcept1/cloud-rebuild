import * as React from "react";

const GENERIC_ERROR_MESSAGE = "Nous n'avons pas pu finaliser cette action. Veuillez réessayer dans quelques instants.";
const AUTH_ERROR_MESSAGE = "Veuillez vous connecter pour continuer.";
const NETWORK_ERROR_MESSAGE = "La connexion semble instable. Vérifiez votre réseau puis réessayez.";
const PAYMENT_ERROR_MESSAGE = "Le paiement n'a pas pu être finalisé. Aucun détail technique n'a été affiché pour votre sécurité.";

const SENSITIVE_ERROR_PATTERNS = [
  /row-level security/i,
  /violates.*policy/i,
  /permission denied/i,
  /forbidden/i,
  /unauthorized/i,
  /jwt/i,
  /refresh token/i,
  /supabase/i,
  /postgres/i,
  /postgrest/i,
  /schema cache/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
  /function .* does not exist/i,
  /rpc/i,
  /sql/i,
  /database/i,
  /duplicate key/i,
  /foreign key/i,
  /violates.*constraint/i,
  /constraint/i,
  /service_role/i,
  /anon key/i,
  /api key/i,
  /secret/i,
  /token/i,
  /bucket/i,
  /storage/i,
  /table\s+"?[a-z0-9_]+"?/i,
  /new row/i,
  /insert/i,
  /update/i,
  /delete/i,
  /select/i,
  /edge function/i,
  /failed to fetch/i,
  /networkerror/i,
  /fetch/i,
  /stripe/i,
];

const AUTH_ERROR_PATTERNS = [/connexion requise/i, /connecter/i, /session.*expir/i, /unauthorized/i, /jwt/i, /refresh token/i];
const NETWORK_ERROR_PATTERNS = [/failed to fetch/i, /networkerror/i, /network/i, /connexion.*instable/i];
const PAYMENT_ERROR_PATTERNS = [/stripe/i, /checkout/i, /paiement/i, /payment/i];

function sanitizeMessage(message: string) {
  if (AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return AUTH_ERROR_MESSAGE;
  if (PAYMENT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return PAYMENT_ERROR_MESSAGE;
  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return NETWORK_ERROR_MESSAGE;
  if (SENSITIVE_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return GENERIC_ERROR_MESSAGE;

  return message;
}

export function getUserFacingErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE) {
  if (typeof error === "string") return sanitizeMessage(error) || fallback;
  if (error instanceof Error) return sanitizeMessage(error.message) || fallback;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return sanitizeMessage(message) || fallback;
  }
  return fallback;
}

export function sanitizeToastNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return getUserFacingErrorMessage(node, node);
  return node;
}
