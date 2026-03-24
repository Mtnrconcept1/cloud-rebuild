import { supabase } from "@/integrations/supabase/client";

const ACCESS_TOKEN_REFRESH_THRESHOLD_MS = 60_000;
const SESSION_EXPIRED_MESSAGE = "Session expiree. Reconnectez-vous.";

function getFunctionsErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function mergeFunctionHeaders(headers: Record<string, string> | undefined, accessToken: string) {
  return {
    ...(headers || {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

function mergeRequestHeaders(headers: HeadersInit | undefined, accessToken: string) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  return nextHeaders;
}

export async function getFreshAccessToken(forceRefresh = false) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  let activeSession = sessionData.session;
  const expiresSoon = Boolean(
    activeSession?.expires_at &&
    (activeSession.expires_at * 1000) <= (Date.now() + ACCESS_TOKEN_REFRESH_THRESHOLD_MS),
  );

  if (forceRefresh || !activeSession || expiresSoon) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    activeSession = refreshedData.session;
  }

  if (!activeSession?.access_token) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return activeSession.access_token;
}

export async function invokeSupabaseFunction<TData = unknown>(
  functionName: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    region?: string;
  } = {},
) {
  let accessToken = await getFreshAccessToken();

  let result = await supabase.functions.invoke<TData>(functionName, {
    ...options,
    headers: mergeFunctionHeaders(options.headers, accessToken),
  });

  if (getFunctionsErrorStatus(result.error) !== 401) {
    return result;
  }

  accessToken = await getFreshAccessToken(true);

  result = await supabase.functions.invoke<TData>(functionName, {
    ...options,
    headers: mergeFunctionHeaders(options.headers, accessToken),
  });

  return result;
}

export async function fetchWithFreshAccessToken(input: string, init: RequestInit = {}) {
  let accessToken = await getFreshAccessToken();

  let response = await fetch(input, {
    ...init,
    headers: mergeRequestHeaders(init.headers, accessToken),
  });

  if (response.status !== 401) {
    return response;
  }

  accessToken = await getFreshAccessToken(true);

  response = await fetch(input, {
    ...init,
    headers: mergeRequestHeaders(init.headers, accessToken),
  });

  return response;
}
