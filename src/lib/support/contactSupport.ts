import { getSupabase } from "@/integrations/supabase/client";
import { invokeSupabaseFunction } from "@/lib/session";

export type ContactSupportSource = "public_contact" | "restaurant_dashboard";

export type ContactSupportRequest = {
  source: ContactSupportSource;
  name?: string | null;
  email?: string | null;
  subject: string;
  message: string;
  captchaToken?: string | null;
  restaurantId?: string | null;
  restaurantName?: string | null;
};

export type ContactSupportResult = {
  ok: boolean;
  supportIncidentId?: string | null;
};

function getFunctionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function getResponseErrorMessage(response: Response | undefined, fallback: string) {
  if (!response) return fallback;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    }

    const text = await response.clone().text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function submitContactSupport(request: ContactSupportRequest) {
  if (request.source === "restaurant_dashboard") {
    const { data, error } = await invokeSupabaseFunction<ContactSupportResult>("contact-support", {
      body: request,
    });

    if (error) throw error;
    return data as ContactSupportResult;
  }

  const { data, error, response } = await getSupabase().functions.invoke<ContactSupportResult>("contact-support", {
    body: request,
  });

  if (error) {
    throw new Error(await getResponseErrorMessage(response, getFunctionErrorMessage(error, "Impossible d'envoyer le message.")));
  }

  return data as ContactSupportResult;
}
