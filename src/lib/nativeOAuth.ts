import { Browser } from "@capacitor/browser";

import { getSupabase } from "@/integrations/supabase/client";
import { getOAuthAuthCallbackHref } from "@/lib/authDomains";
import { isNative } from "@/lib/platform";

export type TokOAuthProvider = "google" | "apple";

export async function startOAuthSignIn(provider: TokOAuthProvider) {
  const native = isNative();
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getOAuthAuthCallbackHref(native),
      ...(native ? { skipBrowserRedirect: true } : {}),
    },
  });

  if (error) throw error;
  if (!native) return;

  if (!data.url) {
    throw new Error(`Supabase did not return an OAuth URL for ${provider}`);
  }

  await Browser.open({ url: data.url });
}
