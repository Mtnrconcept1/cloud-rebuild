import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, marketingBffRequest: request }));
import MarketingSourceDiscovery from "@/components/marketing/MarketingSourceDiscovery";
vi.mock("@/marketing/marketingClient", () => ({
  loadMarketingOutreach: vi.fn().mockResolvedValue({ targets: [], opportunities: [], drafts: [], backlinks: [], metrics: {}, nextCursor: null }),
  approveMarketingOutreachDraft: vi.fn(), recordMarketingOutreachResult: vi.fn(), upsertMarketingBacklink: vi.fn(),
  upsertMarketingOutreachDraft: vi.fn(), upsertMarketingOutreachOpportunity: vi.fn(), upsertMarketingOutreachTarget: vi.fn(),
}));
import MarketingOutreachView from "@/components/marketing/views/MarketingOutreachView";
import { upsertMarketingOutreachTarget } from "@/marketing/marketingClient";
const source = { title: "Food Genève", url: "https://food.ch/article", domain: "food.ch", rationale: "Communauté gastronomique locale", kind: "community" };

describe("marketing source discovery", () => {
  beforeEach(() => { request.mockReset(); });
  afterEach(cleanup);
  it("searches only on request and lets the user select a source", async () => {
    const select = vi.fn();
    request.mockResolvedValue({ sources: [source], searchedAt: "2026-10-09T10:00:00Z" });
    render(<MarketingSourceDiscovery enabled onSelect={select} />);
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Sources recherchées"), { target: { value: "Restaurants et presse à Genève" } });
    fireEvent.click(screen.getByRole("button", { name: "Chercher des sources" }));
    fireEvent.click(await screen.findByRole("button", { name: "Préparer cette cible" }));
    expect(request).toHaveBeenCalledWith("/api/marketing/agent", expect.objectContaining({ body: { action: "discover_sources", query: "Restaurants et presse à Genève", limit: 5, withoutAccountOnly: false }, requireCsrf: true }));
    expect(select).toHaveBeenCalledWith(source, "2026-10-09T10:00:00Z");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("shows provider failure and retains the query for retry", async () => {
    request.mockRejectedValue(new Error("Recherche indisponible"));
    render(<MarketingSourceDiscovery enabled onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Sources recherchées"), { target: { value: "Restaurants Genève" } });
    fireEvent.click(screen.getByRole("button", { name: "Chercher des sources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Recherche indisponible");
    expect(screen.getByLabelText("Sources recherchées")).toHaveValue("Restaurants Genève");
  });
  it("disables search without backend authority", () => {
    render(<MarketingSourceDiscovery enabled={false} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Chercher des sources" })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });
  it("forwards the explicit without-account filter and shows evidence links", async () => {
    request.mockResolvedValue({ sources: [{ ...source, submissionUrl: source.url, evidenceUrl: source.url, accountRequirement: "none", accountEvidence: "Sans inscription", publicationMode: "directory_review" }], searchedAt: "2026-10-09T10:00:00Z" });
    render(<MarketingSourceDiscovery enabled onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Sources recherchées"), { target: { value: "Restaurants Genève" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Chercher des sources" }));
    expect(await screen.findByRole("link", { name: "Voir les conditions citées" })).toHaveAttribute("href", source.url);
    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: expect.objectContaining({ withoutAccountOnly: true }) }));
    expect(screen.getByText(/Sans compte selon les conditions citées/)).toHaveTextContent("à contrôler");
  });
  it("prefills a candidate without saving or granting publication authority", async () => {
    request.mockResolvedValue({ sources: [source], searchedAt: "2026-10-09T10:00:00Z" });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarketingOutreachView canMutateBackend /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Sources recherchées"), { target: { value: "Restaurants et presse à Genève" } });
    fireEvent.click(screen.getByRole("button", { name: "Chercher des sources" }));
    fireEvent.click(await screen.findByRole("button", { name: "Préparer cette cible" }));
    expect(screen.getByLabelText("Nom")).toHaveValue(source.title);
    expect(screen.getByLabelText("Domaine")).toHaveValue(source.domain);
    expect(screen.getByLabelText("URL d’accueil")).toHaveValue(source.url);
    expect((screen.getByLabelText("Notes de conformité") as HTMLTextAreaElement).value).toContain(source.rationale);
    expect(screen.getByLabelText("État")).toHaveTextContent("À vérifier");
    expect(upsertMarketingOutreachTarget).not.toHaveBeenCalled();
  });
});
