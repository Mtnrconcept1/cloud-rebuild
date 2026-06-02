import { describe, expect, it } from "vitest";

import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";

describe("frontend checkout return URL validation", () => {
  it("builds same-origin HTTPS return URLs for TOK domains", () => {
    expect(buildCheckoutReturnUrl("/commande/confirmation", {
      origin: "https://www.thetok.ch",
    })).toBe("https://www.thetok.ch/commande/confirmation");
  });

  it("rejects external return URLs before calling checkout functions", () => {
    expect(() => buildCheckoutReturnUrl("https://evil.example/checkout", {
      origin: "https://www.thetok.ch",
    })).toThrow("URL de retour invalide");
  });

  it("allows localhost for local preview only as the current origin", () => {
    expect(buildCheckoutReturnUrl("/match-groupes", {
      origin: "http://localhost:8080",
    })).toBe("http://localhost:8080/match-groupes");
  });
});
