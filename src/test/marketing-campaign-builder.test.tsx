import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingCampaignBuilder } from "@/components/marketing/MarketingCampaignBuilder";
import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { parseCampaignOptions } from "../../supabase/functions/_shared/marketing-campaign-options";
import { campaignEndDate } from "@/marketing/campaignTemplates";
import * as client from "@/marketing/marketingClient";

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
afterEach(() => { vi.restoreAllMocks(); });

describe("campagne guidée", () => {
  it("conserve les calculs de période des campagnes existantes", () => {
    expect(campaignEndDate("2026-10-14", 4, "daily")).toBe("2026-10-17");
    expect(campaignEndDate("2026-10-14", 3, "weekly")).toBe("2026-10-28");
  });
  it.each([
    { start: "2026-10-12T09:00", startsAt: "2026-10-12T07:00:00.000Z", endsAt: "2026-10-19T08:00:00.000Z" },
    { start: "2026-10-18T09:00", startsAt: "2026-10-18T07:00:00.000Z", endsAt: "2026-10-25T09:00:00.000Z" },
  ])("conserve les thèmes et la cadence en heure de Genève depuis $start", async ({ start, startsAt, endsAt }) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-10T12:00:00Z"));
    const generate = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /Dernière minute/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Découverte restaurant/ }));
    fireEvent.change(screen.getByLabelText("Fréquence"), { target: { value: "twice_weekly" } });
    fireEvent.change(screen.getByLabelText("Début · heure de Genève"), { target: { value: start } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer et générer la campagne" }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const request = generate.mock.calls[0][0];
    expect(request.campaignOptions.templateIds).toEqual(["zero_attente", "last_minute", "discovery"]);
    expect(request.campaignOptions.cadence).toBe("twice_weekly");
    expect(request.startsAt).toBe(startsAt);
    expect(request.endsAt).toBe(endsAt);
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

  it("propose un import distinct pour chaque e-mail généré et bloque navigation et nouvelle génération pendant l’import", async () => {
    const makeItem = (number: number) => ({ id: `71830000-0000-4000-8000-${String(number).padStart(12, "0")}`,
      title: `E-mail ${number}`, channel: "email", scheduled_at: "2027-01-10T08:00:00Z", updated_at: "2026-10-19T08:00:00Z",
      status: "draft", approval_status: "pending", content: { mailing_version: "tok-mailing-v1", subject: `Objet ${number}`,
        headline: `Titre ${number}`, body: `Texte ${number}`, call_to_action: "Découvrir", image_mode: "manual", visual_status: "pending_upload" } });
    bff.mockImplementation((_url, { body }) => Promise.resolve(body.action === "list_runs" ? { runs: [] }
      : body.action === "mailing_facets" ? { items: [], next: null }
        : body.operation === "admin_estimate_marketing_audience" ? { total: 2, eligible: 0, channels: [{ channel: "email", eligible: 0, availability: "available" }] }
          : { campaign: { id: "campaign", name: "Campagne manuelle" }, items: [makeItem(1), makeItem(2)], summary: "Textes prêts", assetCount: 0, estimatedCostChf: 0.1 }));
    let finishUpload!: (value: ReturnType<typeof client.normalizeCalendarItem>) => void;
    const upload = vi.spyOn(client, "uploadMarketingMailingImage").mockReturnValue(new Promise((resolve) => { finishUpload = resolve; }));
    const onGenerated = vi.fn().mockResolvedValue(undefined); const onNavigate = vi.fn(); const onUploadPendingChange = vi.fn();
    render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={onNavigate} onGenerated={onGenerated} onUploadPendingChange={onUploadPendingChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Utiliser l’exemple pizzerias" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Import manuel/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await screen.findByText("2 restaurants correspondants");
    fireEvent.click(screen.getByRole("button", { name: "Générer les textes des e-mails" }));
    const firstInput = await screen.findByLabelText("Importer une image pour E-mail 1");
    expect(screen.getByLabelText("Importer une image pour E-mail 2")).toBeEnabled();
    expect(onGenerated).toHaveBeenCalledTimes(1);
    fireEvent.change(firstInput, { target: { files: [new File(["fixture"], "restaurant.png", { type: "image/png" })] } });
    expect(upload.mock.calls[0].slice(0, 2)).toEqual([makeItem(1).id, "2026-10-19T08:00:00Z"]);
    expect(onUploadPendingChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Générer les textes des e-mails" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Envoyer et générer la campagne" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ouvrir les campagnes pour approbation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Relire et approuver les éléments" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir les campagnes pour approbation" }));
    expect(onNavigate).not.toHaveBeenCalled();
    finishUpload(client.normalizeCalendarItem({ ...makeItem(1), updated_at: "2026-10-19T08:01:00Z", content: {
      ...makeItem(1).content, visual_status: "ready", visual_url: "https://assets.example.test/first-mail.png", visual_source: "upload",
    } }));
    await waitFor(() => expect(screen.getByTitle("Template e-mail — E-mail 1")).toHaveAttribute("srcdoc", expect.stringContaining("first-mail.png")));
    expect(screen.getByTitle("Template e-mail — E-mail 2").getAttribute("srcdoc")).not.toContain("first-mail.png");
    expect(onGenerated).toHaveBeenCalledTimes(2);
    expect(onUploadPendingChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole("button", { name: "Ouvrir les campagnes pour approbation" })).toBeEnabled();
  });
});
