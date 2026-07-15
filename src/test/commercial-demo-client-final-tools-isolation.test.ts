import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("commercial demo final client tools isolation", () => {
  const routes = read("src/lib/commercialDemoClientRoutes.ts");
  const layout = read("src/components/CustomerDashboardLayout.tsx");
  const giftPoints = read("src/pages/GiftPoints.tsx");
  const loyalty = read("src/components/LoyaltyStatus.tsx");

  it("allows every final real client route while keeping its feature flag in navigation", () => {
    for (const path of ["/profil", "/tok-one", "/points-cadeau", "/actualites"]) {
      expect(routes).toContain(`"${path}"`);
    }
    expect(routes).toContain('"/actualites/"');
    expect(layout).toContain('to: "/actualites"');
    expect(layout).toContain('feature: "actualites-sociales"');
    expect(layout).toContain('to: "/tok-one"');
    expect(layout).toContain('feature: "tok-one"');
    expect(layout).toContain('to: "/points-cadeau"');
    expect(layout).toContain('feature: "points-cadeau"');
  });

  it("keeps the real gift interface local in the embedded client frame", () => {
    expect(giftPoints).toContain('const isCommercialDemoClient = commercialDemoFrame?.surface === "client"');
    expect(giftPoints.match(/enabled: Boolean\(user && !isCommercialDemoClient\)/g)).toHaveLength(4);
    expect(giftPoints).toContain("const [demoSentGifts");
    expect(giftPoints).toContain("const [demoReceivedGifts");

    const send = giftPoints.slice(
      giftPoints.indexOf("const sendGiftMutation"),
      giftPoints.indexOf("const claimGiftMutation"),
    );
    expect(send.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(send.indexOf('supabase.rpc as any)("send_gift_points_v2"'));

    const claim = giftPoints.slice(
      giftPoints.indexOf("const claimGiftMutation"),
      giftPoints.indexOf("const loyaltyPoints"),
    );
    expect(claim.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(claim.indexOf('supabase.rpc as any)("claim_gift_points_v2"'));
  });

  it("renders the real loyalty card without reading or mutating production loyalty data", () => {
    expect(loyalty.match(/enabled: Boolean\(user && !isCommercialDemoClient\)/g)).toHaveLength(2);
    expect(loyalty).toContain("demoPoints ?? 2_500");
    const bonus = loyalty.slice(loyalty.indexOf("const birthdayBonusMutation"), loyalty.indexOf("if (!user || !profile)"));
    expect(bonus.indexOf("if (isCommercialDemoClient)"))
      .toBeLessThan(bonus.indexOf('supabase.rpc as any)("claim_miamz_birthday_bonus"'));
  });
});
