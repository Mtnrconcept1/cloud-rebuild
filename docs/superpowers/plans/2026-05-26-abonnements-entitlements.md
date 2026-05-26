# Abonnements Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one reliable entitlement layer for Tok One, meal subscriptions, and restaurant launch packs so app features match the offers described in the current app copy.

**Architecture:** Add focused pure helpers first, then wire them into UI and Edge functions. Keep financial Tok One discounts authoritative in existing checkout pricing, make non-financial benefits explicit for UI/metadata, and centralize launch-pack dashboard gating so frontend admin and Stripe webhook cannot diverge.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres migrations, Supabase Edge Functions on Deno, Stripe Checkout.

---

## File Structure

- `src/lib/subscriptionEntitlements.ts`: pure Tok One benefit parsing and display helpers.
- `src/lib/mealSubscription.ts`: pure meal slot normalization, status, totals, and cart payload helpers.
- `src/lib/packFeatureGating.ts`: existing pack gating helper, extended to export enabled features and service details.
- `src/test/subscription-entitlements.test.ts`: Tok One entitlement tests.
- `src/test/meal-subscription.test.ts`: meal subscription tests.
- `src/test/pack-feature-gating.test.ts`: launch-pack feature tests.
- `supabase/functions/_shared/pack-entitlements.ts`: Deno helper mirroring restaurant pack gating for webhook use.
- `supabase/functions/stripe-webhook/index.ts`: use the shared pack helper when a launch pack is paid.
- `src/pages/admin/AdminLoyalty.tsx`: edit `subscription_benefits` for each plan.
- `src/pages/TokOne.tsx`, `src/pages/Profil.tsx`, `src/pages/Panier.tsx`, `src/pages/ZeroAttente.tsx`: display and consume Tok One entitlements consistently.
- `src/pages/Abonnement.tsx`: use `mealSubscription` and persistent pause/status data.
- `src/pages/PacksRestaurateur.tsx`, `src/pages/dashboard/DashboardPack.tsx`, `src/pages/admin/AdminLaunchPacks.tsx`: show pack service quotas/details from one formatter.
- `supabase/migrations/<generated>_meal_subscription_status.sql`: add unique slot constraint and global meal subscription status.

## Scope Check

This is one implementation plan with four independent slices that compose:

- shared pure helpers and tests;
- Tok One admin/client benefits;
- meal subscription persistence and UI;
- launch-pack gating and service detail display.

Each slice leaves the app usable and testable on its own. Automatic weekly meal payments are not implemented.

### Task 1: Pack Feature Entitlements

**Files:**
- Modify: `src/lib/packFeatureGating.ts`
- Create: `src/test/pack-feature-gating.test.ts`

- [ ] **Step 1: Write the failing pack gating test**

```ts
import { describe, expect, it } from "vitest";

import {
  computeDisabledFeatures,
  computeEnabledFeatures,
  getPackServiceFeatureMap,
  type GatableFeatureKey,
} from "@/lib/packFeatureGating";

describe("packFeatureGating", () => {
  it("unlocks social news when a pack includes social media setup", () => {
    const enabled = computeEnabledFeatures(["social_media_setup"]);

    expect(enabled).toContain("dashboard-reseaux-sociaux");
    expect(enabled).toContain("dashboard-actualites");
    expect(computeDisabledFeatures(["social_media_setup"])).not.toContain("dashboard-actualites");
  });

  it("keeps pack, support, and overview always enabled", () => {
    expect(computeEnabledFeatures([])).toEqual([
      "dashboard-overview",
      "dashboard-support",
      "dashboard-pack",
    ]);
  });

  it("exposes every service mapping without unknown dashboard keys", () => {
    const allKnown = new Set<GatableFeatureKey>([
      "dashboard-overview",
      "dashboard-advisor",
      "dashboard-restaurant",
      "dashboard-menu",
      "dashboard-photos",
      "dashboard-commandes",
      "dashboard-reservations",
      "dashboard-recommandations",
      "dashboard-performances",
      "dashboard-comparaison",
      "dashboard-avis",
      "dashboard-campagne-overview",
      "dashboard-reseaux-sociaux",
      "dashboard-actualites",
      "dashboard-campagnes",
      "dashboard-factures",
      "dashboard-offres",
      "dashboard-ventes-flash",
      "dashboard-formules",
      "dashboard-service",
      "dashboard-plan-salle",
      "dashboard-support",
      "dashboard-pack",
    ]);

    for (const features of Object.values(getPackServiceFeatureMap())) {
      for (const feature of features) {
        expect(allKnown.has(feature)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the pack gating test to verify it fails**

Run: `npm test -- src/test/pack-feature-gating.test.ts`

Expected: FAIL because `computeEnabledFeatures`, `getPackServiceFeatureMap`, and `GatableFeatureKey` are not exported.

- [ ] **Step 3: Implement pack entitlement exports**

Replace `src/lib/packFeatureGating.ts` with this structure, preserving current mapping values:

```ts
import type { LaunchPackServiceSlug } from "./launchPacks";

export const ALL_GATABLE_FEATURES = [
  { key: "dashboard-overview", label: "Vue d'ensemble" },
  { key: "dashboard-advisor", label: "Assistant IA" },
  { key: "dashboard-restaurant", label: "Mon restaurant" },
  { key: "dashboard-menu", label: "Menu" },
  { key: "dashboard-photos", label: "Photos" },
  { key: "dashboard-commandes", label: "Commandes" },
  { key: "dashboard-reservations", label: "Reservations" },
  { key: "dashboard-recommandations", label: "Recommandations" },
  { key: "dashboard-performances", label: "Performances" },
  { key: "dashboard-comparaison", label: "Comparaison" },
  { key: "dashboard-avis", label: "Avis clients" },
  { key: "dashboard-campagne-overview", label: "Campagnes" },
  { key: "dashboard-reseaux-sociaux", label: "Reseaux sociaux" },
  { key: "dashboard-actualites", label: "Actualites" },
  { key: "dashboard-campagnes", label: "Campagnes avancees" },
  { key: "dashboard-factures", label: "Factures" },
  { key: "dashboard-offres", label: "Anti-gaspi" },
  { key: "dashboard-ventes-flash", label: "Ventes flash" },
  { key: "dashboard-formules", label: "Formules" },
  { key: "dashboard-service", label: "Pilotage de service" },
  { key: "dashboard-plan-salle", label: "Plan de salle" },
  { key: "dashboard-support", label: "Aide et support" },
  { key: "dashboard-pack", label: "Pack de lancement" },
] as const;

export type GatableFeatureKey = typeof ALL_GATABLE_FEATURES[number]["key"];

const SERVICE_TO_FEATURES: Record<LaunchPackServiceSlug, GatableFeatureKey[]> = {
  mise_en_place: [
    "dashboard-overview",
    "dashboard-restaurant",
    "dashboard-menu",
    "dashboard-commandes",
    "dashboard-reservations",
    "dashboard-service",
    "dashboard-formules",
    "dashboard-offres",
    "dashboard-ventes-flash",
    "dashboard-avis",
    "dashboard-factures",
    "dashboard-support",
    "dashboard-pack",
  ],
  menu_creation: ["dashboard-menu"],
  product_photography: ["dashboard-photos"],
  social_media_setup: ["dashboard-reseaux-sociaux", "dashboard-actualites"],
  advertising_campaign: ["dashboard-campagne-overview", "dashboard-campagnes"],
  floor_plan_design: ["dashboard-plan-salle"],
  account_manager: [
    "dashboard-advisor",
    "dashboard-recommandations",
    "dashboard-performances",
    "dashboard-comparaison",
  ],
};

const ALWAYS_ENABLED: GatableFeatureKey[] = [
  "dashboard-overview",
  "dashboard-support",
  "dashboard-pack",
];

export function getPackServiceFeatureMap() {
  return SERVICE_TO_FEATURES;
}

export function computeEnabledFeatures(servicesSlugs: LaunchPackServiceSlug[]): GatableFeatureKey[] {
  const enabled = new Set<GatableFeatureKey>(ALWAYS_ENABLED);
  for (const slug of servicesSlugs) {
    for (const feature of SERVICE_TO_FEATURES[slug] || []) {
      enabled.add(feature);
    }
  }
  return ALL_GATABLE_FEATURES.map((feature) => feature.key).filter((feature) => enabled.has(feature));
}

export function computeDisabledFeatures(servicesSlugs: LaunchPackServiceSlug[]): GatableFeatureKey[] {
  const enabled = new Set(computeEnabledFeatures(servicesSlugs));
  return ALL_GATABLE_FEATURES.filter((feature) => !enabled.has(feature.key)).map((feature) => feature.key);
}
```

- [ ] **Step 4: Run the pack gating test to verify it passes**

Run: `npm test -- src/test/pack-feature-gating.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit pack helper changes**

```bash
git add src/lib/packFeatureGating.ts src/test/pack-feature-gating.test.ts
git commit -m "test: cover launch pack feature entitlements"
```

### Task 2: Edge Launch-Pack Gating

**Files:**
- Create: `supabase/functions/_shared/pack-entitlements.ts`
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Write the failing Edge helper test in frontend Vitest**

Extend `src/test/pack-feature-gating.test.ts` with an assertion that mirrors the Edge helper contract:

```ts
it("computes the paid restaurant disabled features for an Essentiel pack", () => {
  const disabled = computeDisabledFeatures([
    "mise_en_place",
    "menu_creation",
    "product_photography",
    "social_media_setup",
  ]);

  expect(disabled).not.toContain("dashboard-photos");
  expect(disabled).not.toContain("dashboard-reseaux-sociaux");
  expect(disabled).not.toContain("dashboard-actualites");
  expect(disabled).toContain("dashboard-plan-salle");
  expect(disabled).toContain("dashboard-campagnes");
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/test/pack-feature-gating.test.ts`

Expected: PASS after Task 1, proving the source contract before wiring Edge.

- [ ] **Step 3: Create the Deno Edge helper**

Create `supabase/functions/_shared/pack-entitlements.ts`:

```ts
export type LaunchPackServiceSlug =
  | "mise_en_place"
  | "menu_creation"
  | "product_photography"
  | "social_media_setup"
  | "advertising_campaign"
  | "floor_plan_design"
  | "account_manager";

export const ALL_GATABLE_FEATURES = [
  "dashboard-overview",
  "dashboard-advisor",
  "dashboard-restaurant",
  "dashboard-menu",
  "dashboard-photos",
  "dashboard-commandes",
  "dashboard-reservations",
  "dashboard-recommandations",
  "dashboard-performances",
  "dashboard-comparaison",
  "dashboard-avis",
  "dashboard-campagne-overview",
  "dashboard-reseaux-sociaux",
  "dashboard-actualites",
  "dashboard-campagnes",
  "dashboard-factures",
  "dashboard-offres",
  "dashboard-ventes-flash",
  "dashboard-formules",
  "dashboard-service",
  "dashboard-plan-salle",
  "dashboard-support",
  "dashboard-pack",
] as const;

const SERVICE_TO_FEATURES: Record<LaunchPackServiceSlug, string[]> = {
  mise_en_place: ["dashboard-overview", "dashboard-restaurant", "dashboard-menu", "dashboard-commandes", "dashboard-reservations", "dashboard-service", "dashboard-formules", "dashboard-offres", "dashboard-ventes-flash", "dashboard-avis", "dashboard-factures", "dashboard-support", "dashboard-pack"],
  menu_creation: ["dashboard-menu"],
  product_photography: ["dashboard-photos"],
  social_media_setup: ["dashboard-reseaux-sociaux", "dashboard-actualites"],
  advertising_campaign: ["dashboard-campagne-overview", "dashboard-campagnes"],
  floor_plan_design: ["dashboard-plan-salle"],
  account_manager: ["dashboard-advisor", "dashboard-recommandations", "dashboard-performances", "dashboard-comparaison"],
};

const ALWAYS_ENABLED = ["dashboard-overview", "dashboard-support", "dashboard-pack"];

export function computeDisabledDashboardFeatures(services: Array<{ service?: string | null }>) {
  const enabled = new Set<string>(ALWAYS_ENABLED);
  for (const service of services) {
    const features = SERVICE_TO_FEATURES[service.service as LaunchPackServiceSlug] || [];
    for (const feature of features) enabled.add(feature);
  }
  return ALL_GATABLE_FEATURES.filter((feature) => !enabled.has(feature));
}
```

- [ ] **Step 4: Replace hardcoded webhook mapping**

In `supabase/functions/stripe-webhook/index.ts`, import the helper:

```ts
import { computeDisabledDashboardFeatures } from "../_shared/pack-entitlements.ts";
```

Replace lines that build `SERVICE_FEATURES`, `ALL_FEATURES`, `ALWAYS_ENABLED`, `enabledByPack`, and `disabledFeatures` with:

```ts
const disabledFeatures = computeDisabledDashboardFeatures(pack.services as Array<{ service?: string | null }>);
```

- [ ] **Step 5: Run release lint target**

Run: `npm run lint:release`

Expected: PASS or existing lint failures unrelated to changed files. Any failure in `stripe-webhook`, `tok-one`, `TokOne`, or `create-checkout` must be fixed in this task.

- [ ] **Step 6: Commit Edge gating changes**

```bash
git add supabase/functions/_shared/pack-entitlements.ts supabase/functions/stripe-webhook/index.ts src/test/pack-feature-gating.test.ts
git commit -m "fix: share launch pack dashboard entitlements"
```

### Task 3: Tok One Entitlement Helper

**Files:**
- Create: `src/lib/subscriptionEntitlements.ts`
- Create: `src/test/subscription-entitlements.test.ts`
- Modify: `src/hooks/useTokOne.ts`

- [ ] **Step 1: Write the failing Tok One entitlement tests**

```ts
import { describe, expect, it } from "vitest";

import {
  TOK_ONE_DEFAULT_BENEFITS,
  buildTokOneEntitlements,
  type SubscriptionBenefitInput,
} from "@/lib/subscriptionEntitlements";

describe("subscriptionEntitlements", () => {
  it("uses app-copy defaults when no subscription benefits are configured", () => {
    const entitlements = buildTokOneEntitlements({ plan: null, benefits: [] });

    expect(entitlements.discountPercent).toBe(20);
    expect(entitlements.freeDeliveryMinOrder).toBe(0);
    expect(entitlements.flags.chefTablePriority).toBe(true);
    expect(entitlements.flags.flashEarlyAccess).toBe(true);
    expect(entitlements.flags.prioritySupport).toBe(true);
    expect(entitlements.displayBenefits.map((benefit) => benefit.id)).toEqual(TOK_ONE_DEFAULT_BENEFITS.map((benefit) => benefit.id));
  });

  it("uses configured financial benefits over defaults", () => {
    const benefits: SubscriptionBenefitInput[] = [
      { benefit_type: "discount_percentage", value: { percentage: 12 } },
      { benefit_type: "free_delivery", value: { min_order: 30 } },
    ];

    const entitlements = buildTokOneEntitlements({
      plan: { free_delivery_min_order: 15 },
      benefits,
    });

    expect(entitlements.discountPercent).toBe(12);
    expect(entitlements.freeDeliveryMinOrder).toBe(30);
  });

  it("turns off a non-financial entitlement when explicitly disabled", () => {
    const entitlements = buildTokOneEntitlements({
      plan: null,
      benefits: [{ benefit_type: "priority_support", value: { enabled: false } }],
    });

    expect(entitlements.flags.prioritySupport).toBe(false);
    expect(entitlements.displayBenefits.find((benefit) => benefit.id === "priority_support")?.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/subscription-entitlements.test.ts`

Expected: FAIL because `src/lib/subscriptionEntitlements.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/subscriptionEntitlements.ts`:

```ts
export type SubscriptionBenefitInput = {
  benefit_type: string;
  value: Record<string, unknown> | null;
};

export type TokOnePlanLike = {
  free_delivery_min_order?: number | null;
};

export const TOK_ONE_DEFAULT_DISCOUNT_PERCENT = 20;

export const TOK_ONE_DEFAULT_BENEFITS = [
  { id: "free_delivery", label: "Livraison gratuite", description: "Frais de livraison offerts selon les conditions du plan." },
  { id: "discount_percentage", label: "Reductions exclusives", description: "Jusqu'a 20% sur les plats eligibles." },
  { id: "chef_table_priority", label: "Acces prioritaire La Table du Chef", description: "Acces prioritaire aux experiences gastronomiques." },
  { id: "flash_early_access", label: "Ventes flash en avance", description: "Acces anticipe aux offres limitees." },
  { id: "priority_support", label: "Support prioritaire", description: "Demandes traitees en priorite." },
  { id: "surprise_offers", label: "Offres surprises", description: "Attentions reservees aux membres Tok One." },
] as const;

type BenefitId = typeof TOK_ONE_DEFAULT_BENEFITS[number]["id"];

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBenefitNumber(benefit: SubscriptionBenefitInput | undefined, keys: string[]) {
  if (!benefit?.value) return 0;
  for (const key of keys) {
    const value = asNumber(benefit.value[key]);
    if (value > 0) return value;
  }
  return 0;
}

function isEnabled(benefit: SubscriptionBenefitInput | undefined) {
  if (!benefit?.value || typeof benefit.value.enabled === "undefined") return true;
  return benefit.value.enabled !== false;
}

export function buildTokOneEntitlements(input: {
  plan: TokOnePlanLike | null | undefined;
  benefits: SubscriptionBenefitInput[] | null | undefined;
}) {
  const benefits = input.benefits || [];
  const byType = new Map(benefits.map((benefit) => [benefit.benefit_type, benefit]));
  const discountBenefit = byType.get("discount_percentage");
  const freeDeliveryBenefit = byType.get("free_delivery");
  const configuredDiscount = getBenefitNumber(discountBenefit, ["percentage", "discount_percent", "percent", "value"]);
  const configuredFreeDelivery = getBenefitNumber(freeDeliveryBenefit, ["min_order", "minimum_order", "free_delivery_min_order", "threshold", "value"]);
  const planFreeDelivery = asNumber(input.plan?.free_delivery_min_order);

  const flags: Record<Exclude<BenefitId, "free_delivery" | "discount_percentage">, boolean> = {
    chefTablePriority: isEnabled(byType.get("chef_table_priority")),
    flashEarlyAccess: isEnabled(byType.get("flash_early_access")),
    prioritySupport: isEnabled(byType.get("priority_support")),
    surpriseOffers: isEnabled(byType.get("surprise_offers")),
  };

  const enabledById: Record<BenefitId, boolean> = {
    free_delivery: isEnabled(freeDeliveryBenefit),
    discount_percentage: isEnabled(discountBenefit),
    chef_table_priority: flags.chefTablePriority,
    flash_early_access: flags.flashEarlyAccess,
    priority_support: flags.prioritySupport,
    surprise_offers: flags.surpriseOffers,
  };

  return {
    discountPercent: enabledById.discount_percentage ? configuredDiscount || TOK_ONE_DEFAULT_DISCOUNT_PERCENT : 0,
    freeDeliveryMinOrder: enabledById.free_delivery ? configuredFreeDelivery || planFreeDelivery || 0 : Number.POSITIVE_INFINITY,
    flags,
    displayBenefits: TOK_ONE_DEFAULT_BENEFITS.map((benefit) => ({
      ...benefit,
      enabled: enabledById[benefit.id],
    })),
  };
}
```

- [ ] **Step 4: Re-export default discount from `useTokOne`**

In `src/hooks/useTokOne.ts`, import and export `TOK_ONE_DEFAULT_DISCOUNT_PERCENT` from the new helper instead of defining a separate constant.

```ts
import { TOK_ONE_DEFAULT_DISCOUNT_PERCENT } from "@/lib/subscriptionEntitlements";
export { TOK_ONE_DEFAULT_DISCOUNT_PERCENT };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/test/subscription-entitlements.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Tok One helper**

```bash
git add src/lib/subscriptionEntitlements.ts src/hooks/useTokOne.ts src/test/subscription-entitlements.test.ts
git commit -m "feat: model tok one entitlements"
```

### Task 4: Meal Subscription Helper

**Files:**
- Create: `src/lib/mealSubscription.ts`
- Create: `src/test/meal-subscription.test.ts`

- [ ] **Step 1: Write the failing meal subscription tests**

```ts
import { describe, expect, it } from "vitest";

import {
  buildMealSubscriptionCartItems,
  getMealSubscriptionSummary,
  normalizeMealSubscriptionSlots,
} from "@/lib/mealSubscription";

describe("mealSubscription", () => {
  it("normalizes duplicate day slots by keeping the latest slot", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Lundi", menuItemId: "old", meal: "Old", restaurant: "R1", restaurantId: "r1", price: 10, time: "12:00" },
      { day: "Lundi", menuItemId: "new", meal: "New", restaurant: "R2", restaurantId: "r2", price: 15, time: "13:00" },
    ]);

    expect(slots.find((slot) => slot.day === "Lundi")?.menuItemId).toBe("new");
    expect(slots).toHaveLength(7);
  });

  it("summarizes active meals and pause status", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Mardi", menuItemId: "item-1", meal: "Plat", restaurant: "Tok", restaurantId: "res", price: 18, time: "12:00" },
    ]);

    expect(getMealSubscriptionSummary(slots, { status: "paused" })).toMatchObject({
      activeMealsCount: 1,
      weeklyTotal: 18,
      isPaused: true,
    });
  });

  it("builds cart items from active slots only", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Mercredi", menuItemId: "item-1", meal: "Plat", restaurant: "Tok", restaurantId: "res", price: 18, time: "12:00" },
      { day: "Jeudi", menuItemId: "", meal: "", restaurant: "", restaurantId: "", price: 0, time: "" },
    ]);

    expect(buildMealSubscriptionCartItems(slots)).toEqual([
      {
        menuItemId: "item-1",
        name: "[Mercredi] Plat",
        price: 18,
        restaurantId: "res",
        restaurantName: "Tok",
        metadata: { subscription_day: "Mercredi", preferred_time: "12:00" },
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/meal-subscription.test.ts`

Expected: FAIL because `src/lib/mealSubscription.ts` does not exist.

- [ ] **Step 3: Implement `mealSubscription`**

Create `src/lib/mealSubscription.ts`:

```ts
export const MEAL_SUBSCRIPTION_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

export type MealSubscriptionDay = typeof MEAL_SUBSCRIPTION_DAYS[number];

export type MealSubscriptionSlot = {
  day: string;
  menuItemId: string;
  meal: string;
  restaurant: string;
  restaurantId: string;
  price: number;
  time: string;
};

export type MealSubscriptionStatus = {
  status: "active" | "paused";
  resume_at?: string | null;
};

const EMPTY_BY_DAY = new Map(MEAL_SUBSCRIPTION_DAYS.map((day) => [day, {
  day,
  menuItemId: "",
  meal: "",
  restaurant: "",
  restaurantId: "",
  price: 0,
  time: "",
} satisfies MealSubscriptionSlot]));

export function normalizeMealSubscriptionSlots(input: MealSubscriptionSlot[]) {
  const byDay = new Map<string, MealSubscriptionSlot>(EMPTY_BY_DAY);
  for (const slot of input) {
    if (!MEAL_SUBSCRIPTION_DAYS.includes(slot.day as MealSubscriptionDay)) continue;
    byDay.set(slot.day, {
      ...EMPTY_BY_DAY.get(slot.day)!,
      ...slot,
      price: Number(slot.price || 0),
    });
  }
  return MEAL_SUBSCRIPTION_DAYS.map((day) => byDay.get(day)!);
}

export function getActiveMealSlots(slots: MealSubscriptionSlot[]) {
  return normalizeMealSubscriptionSlots(slots).filter((slot) => Boolean(slot.menuItemId && slot.meal && slot.restaurantId));
}

export function getMealSubscriptionSummary(slots: MealSubscriptionSlot[], status: MealSubscriptionStatus) {
  const activeSlots = getActiveMealSlots(slots);
  const weeklyTotal = activeSlots.reduce((sum, slot) => sum + Number(slot.price || 0), 0);
  return {
    activeMealsCount: activeSlots.length,
    weeklyTotal,
    regularTotal: activeSlots.length * 18,
    savings: Math.max(0, activeSlots.length * 18 - weeklyTotal),
    isPaused: status.status === "paused",
    resumeAt: status.resume_at || null,
  };
}

export function buildMealSubscriptionCartItems(slots: MealSubscriptionSlot[]) {
  return getActiveMealSlots(slots).map((slot) => ({
    menuItemId: slot.menuItemId,
    name: `[${slot.day}] ${slot.meal}`,
    price: Number(slot.price || 0),
    restaurantId: slot.restaurantId,
    restaurantName: slot.restaurant,
    metadata: {
      subscription_day: slot.day,
      preferred_time: slot.time || "12:00",
    },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/meal-subscription.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit meal helper**

```bash
git add src/lib/mealSubscription.ts src/test/meal-subscription.test.ts
git commit -m "feat: model meal subscription state"
```

### Task 5: Meal Subscription Persistence

**Files:**
- Create: `supabase/migrations/<timestamp>_meal_subscription_status.sql`
- Modify: `src/integrations/supabase/types.ts` only if generated types are updated by the repo workflow.

- [ ] **Step 1: Create the migration with Supabase CLI**

Run: `npx supabase migration new meal_subscription_status`

Expected: creates `supabase/migrations/<timestamp>_meal_subscription_status.sql`.

- [ ] **Step 2: Add migration SQL**

Put this SQL into the generated migration:

```sql
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_user_day_unique UNIQUE (user_id, day_of_week);

CREATE TABLE IF NOT EXISTS public.user_meal_subscription_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  resume_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_meal_subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_meal_subscription_settings_own_all" ON public.user_meal_subscription_settings;
CREATE POLICY "user_meal_subscription_settings_own_all"
  ON public.user_meal_subscription_settings
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS set_updated_at_user_meal_subscription_settings ON public.user_meal_subscription_settings;
CREATE TRIGGER set_updated_at_user_meal_subscription_settings
  BEFORE UPDATE ON public.user_meal_subscription_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_meal_subscription_settings TO authenticated;
```

- [ ] **Step 3: Verify migration SQL with a static test**

Add to `src/test/meal-subscription.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("documents the meal subscription persistence migration", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const migration = readFileSync(
    join(migrationsDir, "<actual-generated-file-name>"),
    "utf8",
  );

  expect(migration).toContain("user_subscriptions_user_day_unique");
  expect(migration).toContain("user_meal_subscription_settings");
  expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
});
```

Replace `<actual-generated-file-name>` with the filename created in Step 1.

- [ ] **Step 4: Run the migration coverage test**

Run: `npm test -- src/test/meal-subscription.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit migration**

```bash
git add supabase/migrations/<timestamp>_meal_subscription_status.sql src/test/meal-subscription.test.ts
git commit -m "feat: persist meal subscription status"
```

### Task 6: Tok One Admin Benefits

**Files:**
- Modify: `src/pages/admin/AdminLoyalty.tsx`
- Test: `src/test/subscription-entitlements.test.ts`

- [ ] **Step 1: Extend tests for admin payload shape**

Add to `src/test/subscription-entitlements.test.ts`:

```ts
import { buildSubscriptionBenefitRows } from "@/lib/subscriptionEntitlements";

it("builds subscription benefit rows for admin saves", () => {
  expect(buildSubscriptionBenefitRows("plan-1", {
    discountPercent: 15,
    freeDeliveryMinOrder: 25,
    chefTablePriority: true,
    flashEarlyAccess: true,
    prioritySupport: false,
    surpriseOffers: true,
  })).toEqual([
    { plan_id: "plan-1", benefit_type: "discount_percentage", value: { percentage: 15 } },
    { plan_id: "plan-1", benefit_type: "free_delivery", value: { min_order: 25 } },
    { plan_id: "plan-1", benefit_type: "chef_table_priority", value: { enabled: true } },
    { plan_id: "plan-1", benefit_type: "flash_early_access", value: { enabled: true } },
    { plan_id: "plan-1", benefit_type: "priority_support", value: { enabled: false } },
    { plan_id: "plan-1", benefit_type: "surprise_offers", value: { enabled: true } },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/subscription-entitlements.test.ts`

Expected: FAIL because `buildSubscriptionBenefitRows` is not implemented.

- [ ] **Step 3: Add admin row builder**

Add this to `src/lib/subscriptionEntitlements.ts`:

```ts
export type TokOneBenefitForm = {
  discountPercent: number;
  freeDeliveryMinOrder: number;
  chefTablePriority: boolean;
  flashEarlyAccess: boolean;
  prioritySupport: boolean;
  surpriseOffers: boolean;
};

export function buildSubscriptionBenefitRows(planId: string, form: TokOneBenefitForm) {
  return [
    { plan_id: planId, benefit_type: "discount_percentage", value: { percentage: Number(form.discountPercent || 0) } },
    { plan_id: planId, benefit_type: "free_delivery", value: { min_order: Number(form.freeDeliveryMinOrder || 0) } },
    { plan_id: planId, benefit_type: "chef_table_priority", value: { enabled: Boolean(form.chefTablePriority) } },
    { plan_id: planId, benefit_type: "flash_early_access", value: { enabled: Boolean(form.flashEarlyAccess) } },
    { plan_id: planId, benefit_type: "priority_support", value: { enabled: Boolean(form.prioritySupport) } },
    { plan_id: planId, benefit_type: "surprise_offers", value: { enabled: Boolean(form.surpriseOffers) } },
  ];
}
```

- [ ] **Step 4: Wire AdminLoyalty**

In `src/pages/admin/AdminLoyalty.tsx`:

- query `subscription_benefits` alongside `user_subscription_plans`;
- on edit, populate the benefit form from `buildTokOneEntitlements`;
- after saving a plan, delete existing `subscription_benefits` for that plan and insert `buildSubscriptionBenefitRows(planId, form)`;
- display each active benefit under the plan card.

Use existing `useToast`, `queryClient.invalidateQueries`, and Supabase client patterns from the file.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/test/subscription-entitlements.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit admin benefits**

```bash
git add src/lib/subscriptionEntitlements.ts src/pages/admin/AdminLoyalty.tsx src/test/subscription-entitlements.test.ts
git commit -m "feat: edit tok one benefits in admin"
```

### Task 7: Meal Subscription Page Wiring

**Files:**
- Modify: `src/pages/Abonnement.tsx`
- Test: `src/test/meal-subscription.test.ts`

- [ ] **Step 1: Confirm helper tests still pass**

Run: `npm test -- src/test/meal-subscription.test.ts`

Expected: PASS.

- [ ] **Step 2: Refactor Abonnement to use helper**

In `src/pages/Abonnement.tsx`:

- import `MEAL_SUBSCRIPTION_DAYS`, `normalizeMealSubscriptionSlots`, `getMealSubscriptionSummary`, and `buildMealSubscriptionCartItems`;
- replace local `DAYS` summary calculations with helper output;
- fetch `user_meal_subscription_settings` for the current user and default to `{ status: "active" }`;
- pause/reprise by upserting `user_meal_subscription_settings`;
- generate cart items with `buildMealSubscriptionCartItems(plan)`;
- keep checkout explicit through `/panier`.

The cart metadata must be:

```ts
{
  feature: "abonnement",
  weeklyTotal: summary.weeklyTotal,
  planDays: activeMeals.map((meal) => meal.day),
  subscription_status: mealSettings.status,
}
```

- [ ] **Step 3: Run app build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit Abonnement wiring**

```bash
git add src/pages/Abonnement.tsx
git commit -m "feat: wire meal subscription settings"
```

### Task 8: Customer Tok One UI Wiring

**Files:**
- Modify: `src/pages/TokOne.tsx`
- Modify: `src/pages/Profil.tsx`
- Modify: `src/pages/Panier.tsx`
- Modify: `src/pages/ZeroAttente.tsx`
- Test: `src/test/subscription-entitlements.test.ts`

- [ ] **Step 1: Confirm entitlement tests still pass**

Run: `npm test -- src/test/subscription-entitlements.test.ts`

Expected: PASS.

- [ ] **Step 2: Wire TokOne plan display**

In `src/pages/TokOne.tsx`, call `useTokOneBenefits(plan?.id)`, then `buildTokOneEntitlements({ plan, benefits })`, and render `displayBenefits` instead of the static benefit truth where possible. Keep the existing visual layout and copy tone.

- [ ] **Step 3: Wire Profil active benefit summary**

In `src/pages/Profil.tsx`, fetch benefits for `subscription?.plan_id`, build entitlements, and show enabled benefit labels in the Tok One card.

- [ ] **Step 4: Wire Panier and ZeroAttente constants**

Keep existing financial calculation behavior, but import default discount from `subscriptionEntitlements` through `useTokOne` so only one default exists.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit customer UI wiring**

```bash
git add src/pages/TokOne.tsx src/pages/Profil.tsx src/pages/Panier.tsx src/pages/ZeroAttente.tsx
git commit -m "feat: show tok one entitlements to customers"
```

### Task 9: Restaurant Pack UI Details

**Files:**
- Modify: `src/lib/launchPacks.ts`
- Modify: `src/pages/PacksRestaurateur.tsx`
- Modify: `src/pages/dashboard/DashboardPack.tsx`
- Modify: `src/pages/admin/AdminLaunchPacks.tsx`
- Test: `src/test/pack-feature-gating.test.ts`

- [ ] **Step 1: Confirm pack tests still pass**

Run: `npm test -- src/test/pack-feature-gating.test.ts`

Expected: PASS.

- [ ] **Step 2: Strengthen service detail formatting**

In `src/lib/launchPacks.ts`, ensure `formatServiceDetail` returns:

```ts
// product_photography quantity null -> "Tous les plats + ambiance"
// menu_creation max_items null -> "Illimite"
// advertising_campaign quantity + budget_chf -> "N campagne(s) - X CHF de budget"
// social_media_setup months_management -> "+ X mois de gestion"
```

- [ ] **Step 3: Display service details consistently**

Use `formatServiceDetail` in:

- public pack cards;
- dashboard pack cards and fulfillment list;
- admin pack detail drawer.

Do not add nested cards; keep the existing compact list style.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit pack UI details**

```bash
git add src/lib/launchPacks.ts src/pages/PacksRestaurateur.tsx src/pages/dashboard/DashboardPack.tsx src/pages/admin/AdminLaunchPacks.tsx
git commit -m "feat: surface launch pack service quotas"
```

### Task 10: Final Verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/test/subscription-entitlements.test.ts src/test/meal-subscription.test.ts src/test/pack-feature-gating.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run release lint**

Run: `npm run lint:release`

Expected: PASS or pre-existing unrelated warnings. Any failure in touched files must be fixed.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run: `git diff --stat`

Expected: only planned files changed.

- [ ] **Step 5: Final commit if previous commits were skipped**

```bash
git add docs/superpowers/specs/2026-05-26-abonnements-entitlements-design.md docs/superpowers/plans/2026-05-26-abonnements-entitlements.md src supabase
git commit -m "feat: align subscriptions with offer entitlements"
```

## Self-Review

Spec coverage:

- Tok One financial and non-financial benefits are covered by Tasks 3, 6, and 8.
- Meal subscription configuration, pause, uniqueness, and explicit checkout are covered by Tasks 4, 5, and 7.
- Launch-pack feature gating and service quotas are covered by Tasks 1, 2, and 9.
- Verification gates are covered by Task 10.

Placeholder scan:

- The plan contains no TBD, TODO, or intentionally incomplete implementation step.

Type consistency:

- `LaunchPackServiceSlug`, `GatableFeatureKey`, `SubscriptionBenefitInput`, and `MealSubscriptionSlot` are introduced before use.
- `computeEnabledFeatures`, `computeDisabledFeatures`, `buildTokOneEntitlements`, `buildSubscriptionBenefitRows`, `normalizeMealSubscriptionSlots`, `getMealSubscriptionSummary`, and `buildMealSubscriptionCartItems` are named consistently across tests and implementation tasks.
