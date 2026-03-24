import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

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
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };
}

function mergeRequestHeaders(headers: HeadersInit | undefined, accessToken: string) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  nextHeaders.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  return nextHeaders;
}

async function normalizeFunctionError(error: unknown, response?: Response) {
  const fallbackMessage = error instanceof Error ? error.message : "Erreur lors de l'appel Edge Function.";
  let message = fallbackMessage;

  if (response) {
    try {
      const clonedResponse = response.clone();
      const contentType = (clonedResponse.headers.get("Content-Type") || "").toLowerCase();

      if (contentType.includes("application/json")) {
        const payload = await clonedResponse.json();
        if (typeof payload?.error === "string" && payload.error.trim()) {
          message = payload.error.trim();
        } else if (typeof payload?.message === "string" && payload.message.trim()) {
          message = payload.message.trim();
        }
      } else {
        const payload = await clonedResponse.text();
        if (payload.trim()) {
          message = payload.trim();
        }
      }
    } catch {
      // Keep the original error message when the body cannot be parsed.
    }
  }

  const normalizedError = new Error(message) as Error & {
    status?: number;
    context?: unknown;
  };

  normalizedError.name = error instanceof Error ? error.name : "FunctionsHttpError";
  normalizedError.status = response?.status ?? getFunctionsErrorStatus(error) ?? undefined;
  normalizedError.context = response ?? (error as { context?: unknown } | null)?.context;
  return normalizedError;
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
  } = {},
) {
  let accessToken = await getFreshAccessToken();

  let result = await supabase.functions.invoke<TData>(functionName, {
    ...options,
    headers: mergeFunctionHeaders(options.headers, accessToken),
  });

  if (getFunctionsErrorStatus(result.error) !== 401) {
    if (result.error) {
      return {
        ...result,
        error: await normalizeFunctionError(result.error, result.response),
      };
    }
    return result;
  }

  accessToken = await getFreshAccessToken(true);

  result = await supabase.functions.invoke<TData>(functionName, {
    ...options,
    headers: mergeFunctionHeaders(options.headers, accessToken),
  });

  if (result.error) {
    return {
      ...result,
      error: await normalizeFunctionError(result.error, result.response),
    };
  }

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
