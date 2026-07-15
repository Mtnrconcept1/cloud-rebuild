import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo client profile and Tok One isolation", () => {
  const profile = read("src/pages/Profil.tsx");
  const tokOne = read("src/pages/TokOne.tsx");

  it("hydrates the real profile from snapshot/local state without production reads", () => {
    expect(profile).toContain('const isCommercialDemoClient = commercialDemoFrame?.surface === "client"');
    expect(profile).toContain("useFeatureFlagSnapshot({ enabled: !isCommercialDemoClient })");
    expect(profile).toContain("new Set(commercialDemoFrame.snapshot.active_features)");
    expect(profile).toContain("commercialDemoFrame.snapshot.demo_restaurant.id");
    expect(profile).toContain("enabled: Boolean(user && !isCommercialDemoClient)");
    expect(profile).toContain("<ProductionSignupApplicationStatus />");
    expect(profile).toContain("<LoyaltyStatus />");
    expect(profile).toContain("L'image n'est pas envoyée au stockage.");
  });

  it("returns from local profile mutations before reaching Supabase, Edge or push", () => {
    const save = profile.slice(profile.indexOf("const handleSave = async () =>"), profile.indexOf("const favoritesQuery"));
    expect(save.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(save.indexOf('supabase.rpc as any)("update_client_profile"'));

    const preferences = profile.slice(profile.indexOf("const updatePreferences = async"), profile.indexOf("const toggleChannel"));
    expect(preferences.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(preferences.indexOf('.from("notification_preferences")'));

    const deletion = profile.slice(profile.indexOf("setDeleting(true)"), profile.indexOf("setDeleting(false)"));
    expect(deletion.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(deletion.indexOf('supabase.functions.invoke("delete-account")'));

    expect(profile).toContain('title: "Push activé", description: "Activation locale à la démonstration."');
    expect(profile).toContain('title: "Push désactivé", description: "Modification locale à la démonstration."');
  });

  it("keeps the production Tok One page and simulates subscription changes locally", () => {
    expect(tokOne).toContain("useTokOnePlans({ enabled: !isCommercialDemoClient })");
    expect(tokOne).toContain("useTokOneSubscription({ enabled: !isCommercialDemoClient })");
    expect(tokOne).toContain("useTokOneBenefits(selectedPlanId ?? undefined, { enabled: !isCommercialDemoClient })");
    expect(tokOne).toContain("window.sessionStorage.setItem(commercialDemoTokOneStorageKey(sessionId)");
    expect(tokOne).toContain("createCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId)");

    const subscribe = tokOne.slice(tokOne.indexOf("const handleSubscribe = async () =>"), tokOne.indexOf("const cancelSubscription"));
    expect(subscribe.indexOf("if (isCommercialDemoClient && commercialDemoFrame)"))
      .toBeLessThan(subscribe.indexOf('supabase.functions.invoke(\n        "create-checkout"'));

    const cancel = tokOne.slice(tokOne.indexOf("const cancelSubscription = async () =>"), tokOne.indexOf("return (", tokOne.indexOf("const cancelSubscription")));
    expect(cancel.indexOf("if (isCommercialDemoClient && commercialDemoFrame)"))
      .toBeLessThan(cancel.indexOf('supabase.functions.invoke(\n        "manage-tok-one-subscription"'));
  });
});
