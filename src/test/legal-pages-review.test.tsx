import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CGU from "@/pages/CGU";
import Cookies from "@/pages/Cookies";
import Privacy from "@/pages/PolitiqueConfidentialite";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION } from "@/lib/consent";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";
import { TRACKER_INVENTORY } from "@/lib/cookieInventory";

afterEach(cleanup);
describe("legal document review", () => {
  it.each([
    ["cgu", CGU, LEGAL_DOCUMENTS.cgu.version],
    ["cookies", Cookies, LEGAL_DOCUMENTS.cookies.version],
    ["confidentialite", Privacy, LEGAL_DOCUMENTS.privacy.version],
  ] as const)("renders %s with its current version and working section links", (id, Page, version) => {
    const view = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(`Version ${version} — applicable dès le ${LEGAL_EFFECTIVE_DATE_FR}`)).toBeInTheDocument();
    for (const link of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#section-"]')) {
      expect(view.container.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Imprimer / enregistrer en PDF" }));
    expect(print).toHaveBeenCalledOnce(); print.mockRestore();
    // Explicit local visual export: real page markup, no app bootstrap or network.
    if (process.env.TOK_LEGAL_PREVIEW_EXPORT === "1") {
      const root = path.resolve("dist");
      const directory = path.join(root, "legal-review"); mkdirSync(directory, { recursive: true });
      const styles = readdirSync(path.join(root, "assets")).filter((file) => file.endsWith(".css"))
        .map((file) => `<link rel="stylesheet" href="/assets/${file}">`).join("");
      writeFileSync(path.join(directory, `${id}.html`), `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<title>Revue locale ${id}</title></head><body><p style="padding:12px;background:#fff7ed;color:#7c2d12">Aperçu local — contenu en cours de revue, actions inactives.</p>${view.container.innerHTML}</body></html>`);
    }
  });
  it("keeps the cookie inventory and actual stored consent on one version", () => {
    expect(CONSENT_VERSION).toBe(LEGAL_DOCUMENTS.cookies.version);
    expect(TRACKER_INVENTORY.some((entry) => entry.name === CONSENT_STORAGE_KEY)).toBe(true);
    expect(LEGAL_DOCUMENTS.restaurantTerms.effectiveDateFr).toBe("11 août 2026");
  });
});
