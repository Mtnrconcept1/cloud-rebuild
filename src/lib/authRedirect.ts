const AUTH_CALLBACK_QUERY_KEYS = [
  "code",
  "error",
  "error_code",
  "error_description",
  "state",
];

const SENSITIVE_AUTH_FRAGMENT_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "expires_in",
  "expires_at",
]);

function getFragmentParams(hash: string) {
  const fragment = hash.replace(/^#/, "");
  const queryStart = fragment.startsWith("/") ? fragment.indexOf("?") : -1;
  const rawParams = queryStart >= 0 ? fragment.slice(queryStart + 1) : fragment;
  return new URLSearchParams(rawParams);
}

function getUrlFromHref(href: string) {
  return new URL(href, "https://www.thetok.ch");
}

export function hasSensitiveAuthFragment(hash: string) {
  if (!hash) return false;

  const params = getFragmentParams(hash);
  for (const key of SENSITIVE_AUTH_FRAGMENT_KEYS) {
    if (params.has(key)) return true;
  }

  return false;
}

export function getSupabaseAuthRedirectState(href: string) {
  const url = getUrlFromHref(href);
  const hashParams = getFragmentParams(url.hash);
  const hasSensitiveFragment = hasSensitiveAuthFragment(url.hash);
  const code = url.searchParams.get("code") || hashParams.get("code");
  const error = url.searchParams.get("error") || hashParams.get("error");
  const errorDescription = url.searchParams.get("error_description") || hashParams.get("error_description");

  return {
    code,
    error,
    errorDescription,
    hasAuthRedirect: Boolean(code || error || errorDescription || hasSensitiveFragment),
    hasSensitiveFragment,
  };
}

export function buildSanitizedAuthRedirectUrl(href: string) {
  const url = getUrlFromHref(href);
  const state = getSupabaseAuthRedirectState(href);

  for (const key of AUTH_CALLBACK_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  if (url.pathname === "/auth/callback") {
    url.pathname = "/auth";
  }

  if (state.hasAuthRedirect) {
    url.hash = "";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

