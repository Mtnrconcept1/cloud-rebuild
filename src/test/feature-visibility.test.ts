import { describe, expect, it } from "vitest";

import {
  getVisiblePublicDiscoverLinks,
  isHelpCategoryVisible,
  isHelpQuestionVisible,
} from "@/lib/featureVisibility";

describe("feature visibility", () => {
  it("hides public discovery links when their feature flag is inactive", () => {
    const links = getVisiblePublicDiscoverLinks(new Set(["anti-gaspi", "tok-one"]));

    expect(links.map((link) => link.to)).toEqual(["/anti-gaspi", "/tok-one"]);
  });

  it("hides whole help categories that depend on inactive features", () => {
    expect(isHelpCategoryVisible("antigaspi", new Set())).toBe(false);
    expect(isHelpCategoryVisible("delivery", new Set(["emporter"]))).toBe(true);
    expect(isHelpCategoryVisible("delivery", new Set())).toBe(false);
    expect(isHelpCategoryVisible("tok-connect", new Set())).toBe(false);
    expect(isHelpCategoryVisible("tok-connect", new Set(["tok-connect"]))).toBe(true);
  });

  it("hides feature-specific help questions when the matching feature is inactive", () => {
    expect(
      isHelpQuestionVisible(
        "features",
        "Comment fonctionnent les Ventes Flash ?",
        "Les offres flash sont limitees dans le temps.",
        new Set(),
      ),
    ).toBe(false);

    expect(
      isHelpQuestionVisible(
        "features",
        "Comment fonctionnent les Ventes Flash ?",
        "Les offres flash sont limitees dans le temps.",
        new Set(["ventes-flash"]),
      ),
    ).toBe(true);
  });

  it("does not hide unrelated payment questions because of PostFinance wording", () => {
    expect(
      isHelpQuestionVisible(
        "account",
        "Quels moyens de paiement sont acceptes ?",
        "Visa, Mastercard, TWINT et PostFinance sont acceptes.",
        new Set(),
      ),
    ).toBe(true);
  });
});
