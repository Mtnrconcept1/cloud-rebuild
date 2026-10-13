import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({
  MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" },
  MarketingBffError: class MarketingBffError extends Error {},
  marketingBffRequest: request,
}));

import MarketingAgentView from "@/components/marketing/views/MarketingAgentView";
import MarketingCampaignsView from "@/components/marketing/views/MarketingCampaignsView";
import { campaignEndDate } from "@/marketing/campaignTemplates";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem } from "@/marketing/marketingClient";

describe("marketing campaign builder", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (_endpoint, options) => {
      if (options.body.action === "list_runs") return { runs: [] };
      return {
        campaign: { id: "campaign-1", name: "Zéro attente Genève" },
        items: [{
          id: "item-1",
          title: "Réservez sans attendre",
          channel: "instagram",
          scheduled_at: "2026-10-14T07:00:00.000Z",
          content: { visual_url: "https://cdn.example/visual.png", format: "1:1" },
        }],
        summary: "Campagne prête à relire.",
        assetCount: 1,
        estimatedCostChf: 0.2,
      };
    });
  });

  afterEach(cleanup);

  it("calcule la période à partir du nombre de posts et de la fréquence", () => {
    expect(campaignEndDate("2026-10-14", 4, "daily")).toBe("2026-10-17");
    expect(campaignEndDate("2026-10-14", 3, "weekly")).toBe("2026-10-28");
  });

  it("génère depuis les cases cochées et transmet le format par réseau", async () => {
    const snapshot = createFallbackMarketingSnapshot();
    snapshot.source = "backend";
    snapshot.integrations = snapshot.integrations.map((integration) => integration.channel === "instagram"
      ? { ...integration, status: "available" }
      : integration);

    render(<MarketingAgentView snapshot={snapshot} canMutateBackend onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Instagram/ }));
    fireEvent.change(screen.getByLabelText("Nombre d'éléments"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Générer ma campagne" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(
      "/api/marketing/agent",
      expect.objectContaining({
        body: expect.objectContaining({
          action: "generate",
          itemCount: 3,
          channels: ["in_app", "instagram"],
          formats: { instagram: "1:1" },
        }),
      }),
    ));
    expect(await screen.findByAltText("Visuel généré pour Réservez sans attendre")).toBeInTheDocument();
    expect(screen.getByText(/Instagram · 1:1 · à approuver/)).toBeInTheDocument();
  });

  it("normalise et affiche les visuels dans la campagne", () => {
    const normalized = normalizeCalendarItem({
      id: "item-1",
      campaign_id: "campaign-1",
      campaign_name: "Anti-gaspi",
      title: "Panier du soir",
      channel: "instagram",
      status: "draft",
      scheduled_at: "2026-10-14T07:00:00.000Z",
      timezone: "Europe/Zurich",
      audience_name: "Clients Genève",
      audience_size: 20,
      approval_status: "pending",
      content: { body: "Surplus confirmé", visual_url: "https://cdn.example/anti-gaspi.png", format: "9:16" },
      updated_at: "2026-10-13T10:00:00.000Z",
    });
    expect(normalized).toMatchObject({ visualUrl: "https://cdn.example/anti-gaspi.png", format: "9:16" });

    const snapshot = createFallbackMarketingSnapshot();
    snapshot.source = "backend";
    snapshot.campaigns = [{
      id: "campaign-1", name: "Anti-gaspi", objective: "Valoriser les surplus confirmés", status: "draft",
      audienceId: "clients-ge", audienceName: "Clients Genève", channels: ["instagram"], startsAt: normalized.scheduledAt,
      endsAt: null, sent: 0, delivered: 0, clicked: 0, conversions: 0, requiresApproval: true,
      content: "", approvedAt: null, updatedAt: "2026-10-13T10:00:00.000Z",
    }];
    snapshot.calendar = [normalized];
    const navigate = vi.fn();

    render(<MarketingCampaignsView
      snapshot={snapshot}
      filters={{ view: "campaigns", query: "", status: "all", channel: "all", page: 1, from: "", to: "" }}
      canMutateBackend
      savePending={false}
      pendingAction={null}
      onFiltersChange={vi.fn()}
      onSave={vi.fn()}
      onApprove={vi.fn()}
      onRecommendChannels={vi.fn()}
      onNavigate={navigate}
    />);

    expect(screen.getByAltText("Visuel généré pour Panier du soir")).toHaveAttribute("src", "https://cdn.example/anti-gaspi.png");
    expect(screen.getByText("9:16")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Relire les publications et les visuels" }));
    expect(navigate).toHaveBeenCalledWith("calendar");
  });

  it("refuse une URL de visuel non HTTPS", () => {
    expect(normalizeCalendarItem({ content: { body: "Texte", visual_url: "http://tracker.example/image.png" } }).visualUrl).toBeNull();
  });
});
