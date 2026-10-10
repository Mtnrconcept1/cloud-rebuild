import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import type { MarketingSnapshot } from "@/marketing/types";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (original) => ({ ...await original<object>(), marketingBffRequest: request }));
const snapshot = { integrations: [{ channel: "facebook", status: "available" }, { channel: "instagram", status: "available" }] } as unknown as MarketingSnapshot;
const mount = () => render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-10T16:51:28Z")); request.mockReset(); request.mockResolvedValue({ runs: [] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("marketing campaign review UX", () => {
  it("does not preselect internal notifications for acquisition", async () => {
    mount(); await waitFor(() => expect(request).toHaveBeenCalled()); expect(screen.getByRole("button", { name: /^in_app/ }).getAttribute("aria-pressed")).toBe("false");
  });
  it("provides a complete Geneva brief without generating or approving on preset selection", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: /Recruter des restaurateurs genevois/i }));
    expect((screen.getByLabelText("Objectif") as HTMLTextAreaElement).value).toContain("5 CHF");
    expect((screen.getByLabelText("Page de destination") as HTMLInputElement).value).toContain("/restaurateurs/alternative-commission-couvert");
    expect(screen.getByRole("button", { name: /^facebook/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^instagram/ }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(request.mock.calls.every(([, options]) => options.body.action === "list_runs")).toBe(true);
  });
  it("rejects a past start in the form before a generation request", async () => {
    mount(); fireEvent.change(screen.getByLabelText("Objectif"), { target: { value: "Présenter TOK" } });
    fireEvent.change(screen.getByLabelText("Début"), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
    await waitFor(() => expect(screen.getByText(/début.*futur|date.*future/i)).toBeTruthy());
    expect(request.mock.calls.every(([, options]) => options.body.action !== "generate")).toBe(true);
  });
  it("shows actual copy, destination and missing media rather than a title-only success", async () => {
    request.mockImplementation(async (_path, options) => options.body.action === "list_runs" ? { runs: [] } : {
      campaign: { id: "campaign", name: "TOK Genève" }, items: [{ id: "item", title: "Comparaison", channel: "instagram", scheduled_at: "2026-10-12T09:00:00Z" }], summary: "Une invitation à comparer", assetCount: 0, estimatedCostChf: 0.01,
      warnings: ["Instagram : visuel manquant, à ajouter avant approbation."],
      previews: [{ title: "Comparaison", channel: "instagram", scheduled_at: "2026-10-12T09:00:00Z", content: { headline: "Payez par table", body: "Le texte réel produit par le générateur.", call_to_action: "Comparer", cta_url: "https://www.thetok.ch/contact", hashtags: [], visual_url: null } }],
    });
    mount(); fireEvent.change(screen.getByLabelText("Objectif"), { target: { value: "Présenter TOK" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
    await waitFor(() => expect(screen.getByText("Le texte réel produit par le générateur.")).toBeTruthy());
    expect(screen.getByText(/Instagram : visuel manquant/)).toBeTruthy();
    expect(screen.getAllByText(/texte uniquement|hors images/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Ouvrir la page de destination/ }).getAttribute("href")).toBe("https://www.thetok.ch/contact");
  });
});


it("distinguishes unknown individual eligibility from public reach", async () => {
  request.mockImplementation(async (_path, options) => options.body.action === "list_runs" ? { runs: [] } : {
    campaign: { id: "campaign", name: "Contacts TOK" }, items: [{ id: "item", title: "Relance", channel: "in_app", scheduled_at: "2026-10-12T09:00:00Z" }], summary: "Relance à relire", assetCount: 0, estimatedCostChf: 0.01,
    audienceEstimate: { channels: [{ channel: "in_app", deliveryMode: "individual", eligibleContacts: null }] },
  });
  mount(); fireEvent.change(screen.getByLabelText("Objectif"), { target: { value: "Informer les contacts TOK" } });
  fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
  await waitFor(() => expect(screen.getByText(/contacts éligibles non estimés/)).toBeTruthy());
});
