import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketingBffRequest } from "@/marketing/marketingBffClient";
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { rpc: "/api/marketing/rpc" }, marketingBffRequest: vi.fn() }));
import MarketingGrowthView from "@/components/marketing/views/MarketingGrowthView";
import { growthOperation, loadGrowthDashboard } from "@/marketing/growth/client";
vi.mock("@/marketing/growth/client", () => ({ growthOperation: vi.fn(), loadGrowthDashboard: vi.fn() }));
const base = { site: { profile: null, profile_version: 0, profile_approved_at: null, paused: true, monthly_budget_micros: null, version: 1 }, articles: [], revisions: [], jobs: [], total: 0, reservedMicros: 0 };
const clients: QueryClient[] = [];
function mount(allowed = true) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client); return render(<QueryClientProvider client={client}><MarketingGrowthView canMutateBackend={allowed}/></QueryClientProvider>); }
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); vi.resetAllMocks(); });
describe("growth workspace", () => {
    it("turns a measured query into an editable brief without creating an article", async () => {
        vi.mocked(loadGrowthDashboard).mockResolvedValue(base);
        vi.mocked(marketingBffRequest).mockResolvedValue({ from:"2026-10-23", to:"2026-10-29", observedDays:7,
          totals:{ clicks:31, impressions:5032 }, opportunities:[{ query:"sortir à Genève", impressions:50, clicks:1, position:8 }] });
        mount();
        fireEvent.click(await screen.findByRole("button",{name:"Recherche Google"}));
        fireEvent.click(await screen.findByRole("button",{name:"Préparer un brief"}));
        expect(screen.getByLabelText<HTMLTextAreaElement>("Sujet et consignes").value).toContain("sortir à Genève");
        expect(screen.queryByRole("button",{name:"Préparer un brief"})).toBeNull();
        expect(growthOperation).not.toHaveBeenCalled();
    });
    it("shows empty real state, explicit pause and missing profile/budget", async () => { vi.mocked(loadGrowthDashboard).mockResolvedValue(base); mount(); expect(await screen.findByText("Moteur éditorial")).toBeInTheDocument(); expect(screen.getByText("En pause")).toBeInTheDocument(); expect(screen.getByText("Aucun article enregistré.")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /publier/i })).not.toBeInTheDocument(); });
    it("does not show simulated data after a failed load", async () => { vi.mocked(loadGrowthDashboard).mockRejectedValue(new Error("Accès indisponible")); mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Accès indisponible"); expect(screen.queryByText("Aucun article enregistré.")).not.toBeInTheDocument(); });
    it("creates a real brief and refreshes only after success", async () => { vi.mocked(loadGrowthDashboard).mockResolvedValue(base); vi.mocked(growthOperation).mockResolvedValue({ ok: true }); mount(); await screen.findByText("Aucun article enregistré."); fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "reserver-geneve" } }); fireEvent.change(screen.getByLabelText("Sujet et consignes"), { target: { value: "Expliquer comment réserver une table à Genève." } }); fireEvent.click(screen.getByRole("button", { name: "Créer le sujet" })); await waitFor(() => expect(growthOperation).toHaveBeenCalledWith("admin_save_marketing_growth_article", { slug: "reserver-geneve", brief: "Expliquer comment réserver une table à Genève." })); });
    it("preserves an unsaved profile when independent limits are saved", async () => { vi.mocked(loadGrowthDashboard).mockResolvedValueOnce(base).mockResolvedValue({ ...base, site: { ...base.site, version: 2, monthly_budget_micros: 1000000 } }); vi.mocked(growthOperation).mockResolvedValue({ ok: true }); mount(); await screen.findByText("Aucun article enregistré."); fireEvent.click(screen.getByRole("button", { name: "Profil et limites" })); fireEvent.change(screen.getByLabelText("Positionnement"), { target: { value: "Un positionnement en cours de rédaction" } }); fireEvent.change(screen.getByLabelText("Plafond mensuel en CHF"), { target: { value: "1" } }); fireEvent.click(screen.getByRole("button", { name: "Enregistrer les limites" })); await screen.findByText("Modification enregistrée."); expect(screen.getByLabelText("Positionnement")).toHaveValue("Un positionnement en cours de rédaction"); });
    it("keeps mutations disabled when backend rights are unavailable", async () => { vi.mocked(loadGrowthDashboard).mockResolvedValue(base); mount(false); await screen.findByText("Aucun article enregistré."); expect(screen.getByRole("button", { name: "Créer le sujet" })).toBeDisabled(); });
});
