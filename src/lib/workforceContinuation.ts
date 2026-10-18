import { TOK_CANONICAL_AUTH_ORIGIN } from "@/lib/authDomains";

export const WORKFORCE_SELF_PATH = "/equipe/mon-espace";
export const WORKFORCE_MANAGEMENT_PATH = "/equipe/gestion";

const RESTAURANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only these internal employee destinations may resume through authentication. */
export function getWorkforceContinuationTarget(rawTarget: string | null | undefined): string | null {
  if (rawTarget === WORKFORCE_SELF_PATH || rawTarget === WORKFORCE_MANAGEMENT_PATH) {
    return rawTarget;
  }
  if (typeof rawTarget !== "string" || rawTarget.length > 200
    || Array.from(rawTarget).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
    || /[\\#]/.test(rawTarget)
    || !rawTarget.startsWith(`${WORKFORCE_SELF_PATH}?`)) {
    return null;
  }

  const url = new URL(rawTarget, TOK_CANONICAL_AUTH_ORIGIN);
  const entries = Array.from(url.searchParams.entries());
  if (url.hash || entries.length !== 1 || entries[0][0] !== "restaurant"
    || !RESTAURANT_ID_PATTERN.test(entries[0][1])) {
    return null;
  }

  return `${WORKFORCE_SELF_PATH}?${new URLSearchParams({ restaurant: entries[0][1].toLowerCase() })}`;
}

/** Preserve the existing callback and signup operation; never forward arbitrary redirects. */
export function buildWorkforceConfirmationRedirect(
  callbackHref: string,
  operationId?: string | null,
  continuation?: string | null,
) {
  const callback = new URL(callbackHref, TOK_CANONICAL_AUTH_ORIGIN);
  callback.searchParams.set("confirmed", "1");
  if (operationId) callback.searchParams.set("signup_operation_id", operationId);
  const target = getWorkforceContinuationTarget(continuation);
  if (target) callback.searchParams.set("redirect", target);
  else callback.searchParams.delete("redirect");
  return callback.toString();
}
