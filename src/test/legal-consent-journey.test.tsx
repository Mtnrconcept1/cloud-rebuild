import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LegalConsentBanner from "@/components/legal/LegalConsentBanner";
import { DEFAULT_CONSENT, readConsent } from "@/lib/consent";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({
  auth: { getSession: () => new Promise(() => undefined) },
}) }));
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
function boot() { render(<MemoryRouter><LegalConsentBanner /><Location /></MemoryRouter>); }
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("privacy choice journey", () => {
  it("keeps every choice outside the scrollable details area", () => {
    boot();
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    const scrollArea = screen.getByRole("dialog").querySelector("[data-dialog-scroll-area]");
    expect(scrollArea).not.toContainElement(screen.getByRole("button", { name: "Tout refuser" }));
    expect(scrollArea).not.toContainElement(screen.getByRole("button", { name: "Enregistrer" }));
    if (process.env.TOK_LEGAL_PREVIEW_EXPORT === "1") {
      const directory = path.resolve("dist/legal-review"); mkdirSync(directory, { recursive: true });
      const styles = readdirSync(path.resolve("dist/assets")).filter((file) => file.endsWith(".css"))
        .map((file) => `<link rel="stylesheet" href="/assets/${file}">`).join("");
      writeFileSync(path.join(directory, "consentement.html"), `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<title>Revue locale du consentement</title></head><body>${document.body.innerHTML}</body></html>`);
    }
  });
  it("allows reading the legal pages without implicitly consenting", () => {
    boot();
    fireEvent.click(screen.getByRole("link", { name: "Confidentialité" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/politique-confidentialite");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readConsent()).toBeNull();
  });
  it("applies refusal immediately while the receipt endpoint is unavailable", () => {
    boot();
    fireEvent.click(screen.getByRole("button", { name: "Tout refuser" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readConsent()?.preferences).toEqual(DEFAULT_CONSENT);
  });
  it("saves only the explicitly selected optional category", () => {
    boot();
    fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
    fireEvent.click(screen.getByRole("switch", { name: "Mesure d’audience" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(readConsent()?.preferences).toEqual({ ...DEFAULT_CONSENT, analytics: true });
  });
  it("does not save unfinished preferences when closing, and restores the saved choice", async () => {
    boot();
    fireEvent.click(screen.getByRole("button", { name: "Tout refuser" }));
    fireEvent.click(screen.getByRole("button", { name: "Gérer mes cookies" }));
    fireEvent.click(screen.getByRole("switch", { name: "Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Gérer mes cookies" }));
    expect(screen.getByRole("switch", { name: "Marketing" })).toHaveAttribute("aria-checked", "false");
    expect(readConsent()?.preferences).toEqual(DEFAULT_CONSENT);
  });
});
