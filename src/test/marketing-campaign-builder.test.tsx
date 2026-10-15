import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingCampaignBuilder } from "@/components/marketing/MarketingCampaignBuilder";
import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { parseCampaignOptions } from "../../supabase/functions/_shared/marketing-campaign-options";
import { campaignEndDate } from "@/marketing/campaignTemplates";

const { bff } = vi.hoisted(() => ({ bff: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({
  MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" },
  MarketingBffError: class extends Error {}, marketingBffRequest: bff,
}));
vi.mock("@/components/marketing/MarketingBrandReferences", () => ({ MarketingBrandReferences: () => <div>Références</div> }));

const snapshot = createFallbackMarketingSnapshot();
function setup(overrides = {}) {
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  render(<MarketingCampaignBuilder snapshot={snapshot} pending={false} disabled={false} onGenerate={onGenerate} {...overrides} />);
  return onGenerate;
}
beforeEach(() => { bff.mockReset(); bff.mockResolvedValue({ runs: [] }); });

describe("campagne guidée", () => {
  it("conserve les calculs de période des campagnes existantes", () => {
    expect(campaignEndDate("2026-10-14", 4, "daily")).toBe("2026-10-17");
    expect(campaignEndDate("2026-10-14", 3, "weekly")).toBe("2026-10-28");
  });
  it("prérègle la rotation de toutes les fonctionnalités TOK sur les deux réseaux, sans publication directe", async () => {
    const generate = setup();
    fireEvent.click(screen.getByRole("button", { name: /Rotation TOK · lot 1/ }));
    expect(screen.getByRole("checkbox", { name: /Studio marketing IA/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Réservations à 5 CHF par table/ })).toBeChecked();
    expect(screen.getByLabelText("Fréquence")).toHaveValue("every_three_hours");
    expect(screen.getByText("12 publications · 6 visuels à générer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const request = generate.mock.calls[0][0];
    expect(request.channels).toEqual(["instagram", "facebook"]);
    expect(request.campaignOptions.templateIds).toHaveLength(20);
    expect(request.campaignOptions).toMatchObject({ postCount: 6, cadence: "every_three_hours",
      formatsByChannel: { instagram: ["1:1"], facebook: ["1:1"] } });
    expect(request).not.toHaveProperty("approved");
  });
  it("prépare les deux dernières heures de la journée en second lot", async () => {
    const generate = setup();
    fireEvent.click(screen.getByRole("button", { name: /Rotation TOK · lot 2/ }));
    expect(screen.getByText("4 publications · 2 visuels à générer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const request = generate.mock.calls[0][0];
    expect(request.channels).toEqual(["instagram", "facebook"]);
    expect(request.campaignOptions).toMatchObject({ postCount: 2, cadence: "every_three_hours" });
    expect(request.campaignOptions.templateIds).toHaveLength(20);
    const startLocalHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" })
      .format(new Date(request.startsAt));
    expect(startLocalHour).toBe("18");
    expect(Date.parse(request.endsAt) - Date.parse(request.startsAt)).toBe(4 * 3_600_000);
  });
  it("conserve les deux thèmes et les fréquences ajoutés sur main", async () => {
    const generate = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Dernière minute/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Découverte restaurant/ }));
    fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "twice_weekly" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const request = generate.mock.calls[0][0];
    expect(request.campaignOptions.templateIds).toEqual(["zero_attente", "last_minute", "discovery"]);
    expect(request.campaignOptions.cadence).toBe("twice_weekly");
    expect(Date.parse(request.endsAt) - Date.parse(request.startsAt)).toBe(7 * 86400000 + 3600000);
  });
  it("conserve le choix de format dans le brief libre avancé", async () => {
    bff.mockImplementation((_url, options) => Promise.resolve(options.body.action === "list_runs" ? { runs: [] } : { items: [], summary: "Prêt", assetCount: 0, estimatedCostChf: 0 }));
    render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByText("Brief libre et autres canaux (avancé)"));
    fireEvent.change(screen.getByLabelText("Objectif"), { target: { value: "Faire découvrir le restaurant" } });
    fireEvent.click(screen.getByRole("button", { name: /Instagram/ }));
    fireEvent.change(screen.getByLabelText("Format Instagram"), { target: { value: "16:9" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer la campagne" }));
    await waitFor(() => expect(bff).toHaveBeenCalledWith("/api/marketing/agent", expect.objectContaining({ body: expect.objectContaining({ action: "generate", formats: { instagram: "16:9" } }) })));
  });
  it("propose les outils restaurateur avec une précision explicite sur les 5 CHF", () => {
    setup();
    for (const label of [/Réservations à 5 CHF par table/, /Studio marketing IA/, /Photo Pro/, /Plan de salle automatisé/, /Menu digital/, /TOK One/]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("Frais restaurateur, table servie, en plus du pack mensuel.")).toBeInTheDocument();
  });
  it("génère les thèmes cochés et les déclinaisons exactes sans texte libre obligatoire", async () => {
    const generate = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Anti-gaspi/ }));
    fireEvent.change(screen.getByLabelText("Posts par réseau et format"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram 9:16" }));
    expect(screen.getByText("6 publications · 4 visuels à générer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const request = generate.mock.calls[0][0];
    expect(request.campaignOptions).toEqual({ templateIds: ["zero_attente", "anti_gaspi"], postCount: 2,
      cadence: "weekly", formatsByChannel: { instagram: ["1:1", "9:16"], facebook: ["1:1"] } });
    expect(parseCampaignOptions(request.campaignOptions, request.channels)).toEqual(request.campaignOptions);
    expect(request.itemCount).toBe(2);
    expect(request).not.toHaveProperty("approved");
    expect(Date.parse(request.endsAt)).toBeGreaterThan(Date.parse(request.startsAt));
  });

  it("refuse nombre fractionnaire, limite dépassée et réseau sans format avant tout appel", () => {
    const generate = setup();
    fireEvent.change(screen.getByLabelText("Posts par réseau et format"), { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: "Envoyer et générer la campagne" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Posts par réseau et format"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Instagram 9:16" }));
    expect(screen.getByText(/Ce lot dépasse/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Posts par réseau et format"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Facebook 1:1" }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    expect(screen.getByText(/un format pour chaque réseau/)).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
  });

  it("bloque les changements et envois concurrents pendant la génération", () => {
    const generate = setup({ pending: true });
    expect(screen.getByRole("button", { name: /Préparation des textes/ })).toBeDisabled();
    expect(screen.getByLabelText("Posts par réseau et format")).toBeDisabled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("montre le visuel et le texte reçus immédiatement puis conserve les choix en cas d'erreur", async () => {
    const onGenerated = vi.fn().mockResolvedValue(undefined);
    bff.mockImplementation((_url, options) => options.body.action === "list_runs" ? Promise.resolve({ runs: [] }) : Promise.resolve({
      campaign: { id: "campaign", name: "Campagne anti-gaspi" }, summary: "Résumé", assetCount: 1, estimatedCostChf: 0.1,
      items: [{ id: "post", title: "Votre repas", channel: "instagram", scheduled_at: "2027-01-10T08:00:00Z", content: { headline: "Moins de gaspillage", body: "Découvrez les offres", visual_url: "https://example.org/visual.png" } }],
    }));
    render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} onGenerated={onGenerated} />);
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    expect(await screen.findByRole("img", { name: "Visuel : Votre repas" })).toHaveAttribute("src", "https://example.org/visual.png");
    expect(screen.getByText(/Moins de gaspillage/)).toBeInTheDocument();
    expect(onGenerated).toHaveBeenCalledTimes(1);
    bff.mockRejectedValueOnce(new Error("provider down"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    expect(await screen.findAllByText("L'agent n'a pas pu produire de plan.")).not.toHaveLength(0);
    expect(screen.getByRole("checkbox", { name: /Zéro attente/ })).toBeChecked();
    expect(screen.getByLabelText("Posts par réseau et format")).toHaveValue(3);
  });
});
