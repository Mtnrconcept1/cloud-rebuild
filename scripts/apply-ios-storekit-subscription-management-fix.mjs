import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [label, from, to] of replacements) {
    if (!source.includes(from)) {
      throw new Error(`${path}: missing fragment for ${label}`);
    }
    source = source.replace(from, to);
  }
  await writeFile(path, source, "utf8");
  console.log(`Patched ${path}`);
}

await patch("src/hooks/useTokOne.ts", [
  [
    "subscription billing provider type",
    '  stripe_mode?: "live" | "test" | string | null;\n  stripe_session_id?: string | null;',
    '  stripe_mode?: "live" | "test" | string | null;\n  billing_provider?: "stripe" | "apple" | string | null;\n  apple_original_transaction_id?: string | null;\n  stripe_session_id?: string | null;',
  ],
  [
    "attach billing provider",
    '    stripe_mode: subscription.stripe_mode ?? null,\n    user_subscription_plans: plan,',
    '    stripe_mode: subscription.stripe_mode ?? null,\n    billing_provider: subscription.billing_provider ?? "stripe",\n    apple_original_transaction_id: subscription.apple_original_transaction_id ?? null,\n    user_subscription_plans: plan,',
  ],
]);

await patch("src/pages/TokOne.tsx", [
  [
    "Capacitor Browser import",
    'import { motion } from "framer-motion";\n',
    'import { motion } from "framer-motion";\nimport { Browser } from "@capacitor/browser";\n',
  ],
  [
    "disable Stripe back cancellation on iOS",
    '    enabled: !isCommercialDemoClient,\n',
    '    enabled: !isCommercialDemoClient && !isNativeIos,\n',
  ],
  [
    "native StoreKit cancelled return",
    '    if (status === "cancelled") {\n      window.history.replaceState({}, "", window.location.pathname);\n      if (!paymentAttemptId) {',
    '    if (status === "cancelled") {\n      window.history.replaceState({}, "", window.location.pathname);\n      if (isNativeIos) {\n        if (paymentAttemptId) {\n          clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);\n        }\n        setCheckoutLoading(false);\n        toast({\n          title: "Achat annulé",\n          description: "Aucun abonnement Tok One Apple n’a été créé.",\n        });\n        return;\n      }\n      if (!paymentAttemptId) {',
  ],
  [
    "native StoreKit checkout terminal handling",
    '      if (!checkout.url) {\n        throw new Error("L\'abonnement est en cours de vérification. Relancez avec le même bouton dans quelques secondes.");\n      }\n      markPaymentAttemptRedirected(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);',
    '      if (isNativeIos && checkout.state === "cancelled") {\n        clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);\n        toast({\n          title: "Achat annulé",\n          description: "Aucun abonnement Tok One Apple n’a été créé.",\n        });\n        return;\n      }\n\n      if (isNativeIos && checkout.state === "succeeded") {\n        clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);\n        queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });\n        await refetchSubscription();\n        toast({\n          title: "Bienvenue dans Tok One !",\n          description: "Votre abonnement Apple est actif.",\n        });\n        return;\n      }\n\n      if (!checkout.url) {\n        throw new Error("L\'abonnement est en cours de vérification. Relancez avec le même bouton dans quelques secondes.");\n      }\n      markPaymentAttemptRedirected(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);',
  ],
  [
    "Apple subscription cancellation routing",
    '  const cancelSubscription = async () => {\n    if (!subscription) return;\n    const confirmed = window.confirm(\n      "Résilier Tok One à la fin de la période en cours ? La demande doit être faite au plus tard 3 jours avant le renouvellement mensuel.",\n    );\n    if (!confirmed) return;\n\n    setCancelLoading(true);',
    '  const cancelSubscription = async () => {\n    if (!subscription) return;\n    const isAppleManagedSubscription =\n      isNativeIos && subscription.billing_provider === "apple";\n    const confirmed = window.confirm(\n      isAppleManagedSubscription\n        ? "Ouvrir la gestion de vos abonnements Apple pour modifier ou résilier Tok One ?"\n        : "Résilier Tok One à la fin de la période en cours ? La demande doit être faite au plus tard 3 jours avant le renouvellement mensuel.",\n    );\n    if (!confirmed) return;\n\n    setCancelLoading(true);\n    if (isAppleManagedSubscription) {\n      try {\n        await Browser.open({ url: "https://apps.apple.com/account/subscriptions" });\n        toast({\n          title: "Gestion Apple ouverte",\n          description: "La résiliation et le renouvellement de cet abonnement sont gérés par Apple.",\n        });\n      } catch (error) {\n        toast({\n          title: "Gestion Apple indisponible",\n          description: error instanceof Error ? error.message : "Impossible d’ouvrir les abonnements Apple.",\n          variant: "destructive",\n        });\n      } finally {\n        setCancelLoading(false);\n      }\n      return;\n    }',
  ],
]);

await patch("supabase/functions/_shared/tok-one.ts", [
  [
    "Stripe existing subscription selects provider",
    '.select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id")\n      .eq("stripe_subscription_id", stripeSubscriptionId)',
    '.select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")\n      .eq("stripe_subscription_id", stripeSubscriptionId)',
  ],
  [
    "Stripe fallback lookup provider filter",
    '.select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id")\n    .eq("user_id", userId)\n    .eq("plan_id", planId)\n    .eq("stripe_mode", stripeMode)',
    '.select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")\n    .eq("user_id", userId)\n    .eq("plan_id", planId)\n    .eq("stripe_mode", stripeMode)\n    .eq("billing_provider", "stripe")',
  ],
  [
    "latest Tok One provider fields",
    '.select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id")\n    .eq("user_id", userId)',
    '.select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")\n    .eq("user_id", userId)',
  ],
  [
    "Stripe synchronization provenance",
    '    stripe_subscription_id: subscription.id,\n    stripe_mode: normalizedStripeMode,',
    '    stripe_subscription_id: subscription.id,\n    stripe_mode: normalizedStripeMode,\n    billing_provider: "stripe",',
  ],
]);

await patch("supabase/functions/manage-tok-one-subscription/index.ts", [[
  "reject Apple-managed lifecycle mutation",
  '    if (!isTokOneEntitledStatus(subscription.status) && action === "cancel") {\n      throw new HttpError(409, "Aucun abonnement actif a resilier");\n    }\n\n    if (action === "cancel") {',
  '    if (!isTokOneEntitledStatus(subscription.status) && action === "cancel") {\n      throw new HttpError(409, "Aucun abonnement actif a resilier");\n    }\n\n    if (String(subscription.billing_provider || "").toLowerCase() === "apple") {\n      throw new HttpError(\n        409,\n        "APPLE_MANAGED_SUBSCRIPTION: cet abonnement Tok One est géré par Apple. Utilisez la gestion des abonnements Apple pour le modifier ou le résilier.",\n      );\n    }\n\n    if (action === "cancel") {',
]]);
