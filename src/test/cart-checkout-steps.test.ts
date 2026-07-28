import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const cartPageSource = readFileSync(resolve(root, "src/pages/Panier.tsx"), "utf8");
const suggestionsSource = readFileSync(resolve(root, "src/components/cart/CartSuggestionsStep.tsx"), "utf8");
const suggestionsLogicSource = readFileSync(resolve(root, "src/lib/cartSuggestions.ts"), "utf8");

describe("cart checkout steps", () => {
  it("splits the classic cart into summary, address, suggestions and payment steps", () => {
    expect(cartPageSource).toContain('type CheckoutStepId = "summary" | "address" | "suggestions" | "payment"');
    expect(cartPageSource).toContain("CHECKOUT_STEPS");
    expect(cartPageSource).toContain("getCheckoutSteps");
    expect(cartPageSource).toContain('label: "Resume"');
    expect(cartPageSource).toContain('label: "Adresse"');
    expect(cartPageSource).toContain('label: "Heure de retrait"');
    expect(cartPageSource).toContain('description: "Date et créneau"');
    expect(cartPageSource).toContain("getCheckoutSteps(orderMode).filter");
    expect(cartPageSource).toContain('!isCommercialDemoClient || step.id !== "suggestions"');
    expect(cartPageSource).toContain("[isCommercialDemoClient, orderMode]");
    expect(cartPageSource).toContain('label: "Suggestions"');
    expect(cartPageSource).toContain('label: "Paiement"');
    expect(cartPageSource).toContain('checkoutStep === "summary"');
    expect(cartPageSource).toContain('checkoutStep === "address"');
    expect(cartPageSource).toContain('checkoutStep === "suggestions"');
    expect(cartPageSource).toContain('checkoutStep === "payment"');
  });

  it("skips production upsell data only inside the isolated commercial demo", () => {
    expect(cartPageSource).toContain('setCheckoutStep(isCommercialDemoClient ? "payment" : "suggestions")');
  });

  it("keeps delivery/takeaway selection in the summary step", () => {
    expect(cartPageSource).toContain("Mode de commande");
    expect(cartPageSource).toContain('setOrderMode("delivery", { force: true })');
    expect(cartPageSource).toContain('setOrderMode("takeaway", { force: true })');
    expect(cartPageSource).toContain("Vous pouvez encore choisir entre livraison et emporter");
  });

  it("requires a selected delivery address with a street number before checkout", () => {
    expect(cartPageSource).toContain("hasPreciseStreetNumber");
    expect(cartPageSource).toContain("deliveryAddressHasPreciseNumber");
    expect(cartPageSource).toContain("Numéro de rue requis");
    expect(cartPageSource).toContain("deliverySelection?.latitude == null");
    expect(cartPageSource).toContain("validateAddressStep");
    expect(cartPageSource).toContain("!validateJourneyStep() || !validateAddressStep()");
  });

  it("turns upsell into an inline recommendations step", () => {
    expect(cartPageSource).toContain("CartSuggestionsStep");
    expect(cartPageSource).toContain("handleAddSuggestedItem");
    expect(cartPageSource).not.toContain("<UpsellModal");
    expect(suggestionsLogicSource).toContain("buildCartSignals");
    expect(suggestionsLogicSource).toContain("scoreSuggestion");
    expect(suggestionsLogicSource).toContain("Deja commande dans ce restaurant");
    expect(suggestionsSource).toContain("cart-suggestions-order-history");
    expect(suggestionsSource).toContain("missingForFreeDelivery");
    expect(suggestionsLogicSource).toContain("Proche des produits deja choisis");
  });

  it("keeps the suggestions step readable on mobile and desktop", () => {
    expect(suggestionsSource).toContain("grid gap-3 sm:grid-cols-2 xl:grid-cols-3");
    expect(suggestionsSource).toContain("minmax(0,1fr)");
    expect(suggestionsSource).toContain("grid-cols-[76px_minmax(0,1fr)]");
    expect(suggestionsSource).toContain("h-full min-h-[104px] w-[76px]");
    expect(suggestionsSource).toContain("sm:h-auto sm:min-h-0 sm:w-full");
    expect(suggestionsSource).toContain("line-clamp-1 break-words text-sm font-semibold sm:line-clamp-2");
    expect(suggestionsSource).toContain("mt-auto flex items-center gap-2 sm:flex-col sm:items-stretch");
    expect(suggestionsSource).toContain("h-8 shrink-0 px-3 sm:h-9 sm:w-full");
    expect(suggestionsSource).toContain("relative");
    expect(suggestionsSource).toContain("absolute inset-0 h-full w-full object-cover");
    expect(suggestionsSource).toContain("break-words");
    expect(suggestionsSource).not.toContain("grid-cols-[88px_minmax(0,1fr)]");
    expect(suggestionsSource).not.toContain("h-[88px] w-[88px]");
    expect(suggestionsSource).not.toContain("h-full min-h-[76px]");
    expect(suggestionsSource).not.toContain("w-max");
    expect(suggestionsSource).not.toContain("w-[180px]");
  });
});
