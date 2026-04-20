import { getSupabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

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

function mergeRpcHeaders(
  headers: Record<string, string> | undefined,
  accessToken: string,
  schema: string,
) {
  return {
    ...(headers || {}),
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    "Content-Profile": schema,
  };
}

function mergeRequestHeaders(headers: HeadersInit | undefined, accessToken: string) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  nextHeaders.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  return nextHeaders;
}

async function getHttpErrorMessage(response: Response | undefined, fallbackMessage: string) {
  if (!response) return fallbackMessage;

  let message = fallbackMessage;

  try {
    const clonedResponse = response.clone();
    const contentType = (clonedResponse.headers.get("Content-Type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const payload = await clonedResponse.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        message = payload.error.trim();
      } else if (typeof payload?.message === "string" && payload.message.trim()) {
        message = payload.message.trim();
      } else if (typeof payload?.hint === "string" && payload.hint.trim()) {
        message = payload.hint.trim();
      }
    } else {
      const payload = await clonedResponse.text();
      if (payload.trim()) {
        message = payload.trim();
      }
    }
  } catch {
    // Keep the fallback when the body cannot be parsed.
  }

  return message;
}

async function normalizeHttpError(
  fallbackMessage: string,
  response?: Response,
  name = "FunctionsHttpError",
) {
  const normalizedError = new Error(await getHttpErrorMessage(response, fallbackMessage)) as Error & {
    status?: number;
    context?: unknown;
  };

  normalizedError.name = name;
  normalizedError.status = response?.status;
  normalizedError.context = response;
  return normalizedError;
}

async function normalizeFunctionError(error: unknown, response?: Response) {
  const fallbackMessage = error instanceof Error ? error.message : "Erreur lors de l'appel Edge Function.";
  const normalizedError = await normalizeHttpError(
    fallbackMessage,
    response,
    error instanceof Error ? error.name : "FunctionsHttpError",
  );
  normalizedError.status = response?.status ?? getFunctionsErrorStatus(error) ?? undefined;
  normalizedError.context = response ?? (error as { context?: unknown } | null)?.context;
  return normalizedError;
}

export async function getFreshAccessToken(forceRefresh = false) {
  const { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();

  if (sessionError) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  let activeSession = sessionData.session;
  const expiresSoon = Boolean(
    activeSession?.expires_at &&
    (activeSession.expires_at * 1000) <= (Date.now() + ACCESS_TOKEN_REFRESH_THRESHOLD_MS),
  );

  if (forceRefresh || !activeSession || expiresSoon) {
    const { data: refreshedData, error: refreshError } = await getSupabase().auth.refreshSession();
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
    accessToken?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const { accessToken: providedAccessToken, ...invokeOptions } = options;
  let accessToken = providedAccessToken || await getFreshAccessToken();

  let result = await getSupabase().functions.invoke<TData>(functionName, {
    ...invokeOptions,
    headers: mergeFunctionHeaders(invokeOptions.headers, accessToken),
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

  result = await getSupabase().functions.invoke<TData>(functionName, {
    ...invokeOptions,
    headers: mergeFunctionHeaders(invokeOptions.headers, accessToken),
  });

  if (result.error) {
    return {
      ...result,
      error: await normalizeFunctionError(result.error, result.response),
    };
  }

  return result;
}

export async function invokeSupabaseRpc<TData = unknown>(
  rpcName: string,
  options: {
    accessToken?: string;
    body?: unknown;
    headers?: Record<string, string>;
    schema?: string;
  } = {},
) {
  const {
    accessToken: providedAccessToken,
    body,
    headers,
    schema = "public",
  } = options;

  const endpoint = `${SUPABASE_URL}/rest/v1/rpc/${rpcName}`;

  const invoke = async (accessToken: string) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: mergeRpcHeaders(headers, accessToken, schema),
      body: JSON.stringify(body ?? {}),
    });

    const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
    let data: TData | null = null;

    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    } else if (response.status !== 204) {
      data = await response.text().then((value) => value as TData).catch(() => null);
    }

    return { response, data };
  };

  let accessToken = providedAccessToken || await getFreshAccessToken();
  let result = await invoke(accessToken);

  if (result.response.status === 401) {
    accessToken = await getFreshAccessToken(true);
    result = await invoke(accessToken);
  }

  if (!result.response.ok) {
    throw await normalizeHttpError(
      "Erreur lors de l'appel RPC Supabase.",
      result.response,
      "PostgrestError",
    );
  }

  return result.data;
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
