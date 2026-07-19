import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductionSupabase } from "@/integrations/supabase/client";
import {
  COMMERCIAL_DEMO_SUPABASE_PROJECT_REF,
  getCommercialDemoSupabase,
} from "@/integrations/supabase/demoClient";
import type { Database } from "@/integrations/supabase/types";

const PROVISION_FUNCTION = "provision-commercial-demo-project-session";

type ProvisionResponse = {
  project_ref: string;
  user_id: string;
  token_hash: string;
  verification_type: "magiclink";
};

let sessionPromise: Promise<SupabaseClient<Database>> | null = null;

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function provisionSession() {
  const production = getProductionSupabase();
  const demo = getCommercialDemoSupabase();
  const { data: productionAuth, error: productionAuthError } = await production.auth.getUser();

  if (productionAuthError || !productionAuth.user || !isUuid(productionAuth.user.id)) {
    throw new Error("Votre session commerciale a expiré. Reconnectez-vous avant d'ouvrir la démonstration.");
  }

  const productionUserId = productionAuth.user.id;
  const { data: existing } = await demo.auth.getSession();
  if (existing.session?.user.id === productionUserId) return demo;

  if (existing.session) await demo.auth.signOut({ scope: "local" });

  const { data, error } = await production.functions.invoke(PROVISION_FUNCTION, {
    body: { requested_project_ref: COMMERCIAL_DEMO_SUPABASE_PROJECT_REF },
  });
  if (error) throw error;

  const response = data as Partial<ProvisionResponse> | null;
  if (
    response?.project_ref !== COMMERCIAL_DEMO_SUPABASE_PROJECT_REF
    || response.verification_type !== "magiclink"
    || response.user_id !== productionUserId
    || !isUuid(response.user_id)
    || typeof response.token_hash !== "string"
    || response.token_hash.length < 20
  ) {
    throw new Error("La session Démo dédiée n'a pas pu être vérifiée.");
  }

  const { data: verified, error: verifyError } = await demo.auth.verifyOtp({
    type: "magiclink",
    token_hash: response.token_hash,
  });
  if (verifyError || verified.user?.id !== productionUserId || !verified.session) {
    throw verifyError || new Error("La session Démo reçue ne correspond pas au compte commercial.");
  }

  return demo;
}

export async function ensureCommercialDemoProjectSession() {
  if (!sessionPromise) {
    sessionPromise = provisionSession().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

export async function invokeCommercialDemoRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const demo = await ensureCommercialDemoProjectSession();
  const { data, error } = await demo.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
}

export async function invokeCommercialDemoFunction<T>(
  name: string,
  body: Record<string, unknown>,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
  } = {},
): Promise<T> {
  const demo = await ensureCommercialDemoProjectSession();
  const { data, error } = await demo.functions.invoke<T>(name, {
    body,
    ...options,
  });
  if (error) throw error;
  return data as T;
}

export async function resetCommercialDemoProjectSession() {
  sessionPromise = null;
  await getCommercialDemoSupabase().auth.signOut({ scope: "local" });
}
