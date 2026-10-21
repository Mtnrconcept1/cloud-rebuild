import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MarketingResultsView from "@/components/marketing/views/MarketingResultsView";
import { createFallbackMarketingAutopilotDashboard, type MarketingAutopilotDashboard, type MarketingAutopilotMetric } from "@/marketing/autopilotTypes";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const filters: MarketingUrlState = { view: "results", query: "", status: "all", channel: "all", page: 1, from: "2026-10-01", to: "2026-10-21" };
type Props = Parameters<typeof MarketingResultsView>[0];

function metric(key: string, value: number | null, overrides: Partial<MarketingAutopilotMetric> = {}): MarketingAutopilotMetric {
  return { key, label: key, value, unit: null, source: "marketing_event_facts", observedAt: null, freshness: "unknown", unavailableReason: value === null ? `${key}_data_unavailable` : null, ...overrides };
}

function dashboard(metrics: MarketingAutopilotMetric[] = []): MarketingAutopilotDashboard {
  const fallback = createFallbackMarketingAutopilotDashboard();
  return { ...fallback, source: "backend" as const, generatedAt: "2026-10-21T08:00:00Z", analytics: { ...fallback.analytics, metrics, unavailableReasons: [], completeness: metrics.length ? metrics.filter((item) => item.value !== null).length / metrics.length : 0, generatedAt: "2026-10-21T08:00:00Z" } };
}

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    snapshot: { ...createFallbackMarketingSnapshot(), source: "backend" },
    filters,
    autopilot: dashboard(),
    autopilotLoading: false,
    autopilotError: null,
    onFiltersChange: vi.fn(),
    onRefreshAutopilot: vi.fn(),
    ...overrides,
  };
  return { ...render(<MarketingResultsView {...props} />), props };
}

afterEach(() => cleanup());

describe("résultats Analytics TOK", () => {
  it("regroupe les codes indisponibles en explications françaises sans fausse mesure", () => {
    const data = dashboard();
    data.analytics.unavailableReasons = [
      "delivery_events_unavailable", "sent_data_unavailable", "delivered_data_unavailable", "click_data_unavailable", "delivery_conversion_data_unavailable",
      "spend_data_unavailable", "revenue_data_unavailable", "lead_data_unavailable", "conversion_data_unavailable", "customer_acquisition_data_unavailable",
    ];
    const { container } = mount({ autopilot: data });
    expect(screen.getByText("Aucun résultat confirmé pour cette période")).toBeInTheDocument();
    expect(screen.getByText(/Une campagne préparée ou approuvée attend encore sa diffusion/)).toBeInTheDocument();
    const warning = screen.getByRole("alert");
    expect(within(warning).getAllByRole("listitem")).toHaveLength(3);
    expect(within(warning).getByText("Suivi de diffusion incomplet")).toBeInTheDocument();
    expect(within(warning).getByText("Dépenses et revenus à relier")).toBeInTheDocument();
    expect(within(warning).getByText("Attribution commerciale incomplète")).toBeInTheDocument();
    expect(container.textContent).not.toContain("_unavailable");
  });

  it("sépare activité, diffusion et attribution et conserve un zéro confirmé", () => {
    mount({ autopilot: dashboard([
      metric("campaigns_created", 3, { label: "Campagnes créées", source: "marketing_campaigns", group: "activity" }),
      metric("social_publications", 0, { label: "Publications Meta confirmées", source: "marketing_calendar_items", group: "activity" }),
      metric("sent", 2, { label: "Envois", group: "delivery" }),
      metric("cac", null, { label: "CAC", source: "marketing_attribution_facts", group: "attribution", unit: "CHF" }),
    ]) });
    const activity = screen.getByRole("region", { name: "Activité marketing" });
    expect(within(activity).getByRole("heading", { name: "Publications Meta confirmées" })).toBeInTheDocument();
    expect(within(activity).getByText("0")).toBeInTheDocument();
    expect(within(activity).getByText("Campagnes TOK")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Diffusion et interactions" })).getByText("2")).toBeInTheDocument();
    const attribution = screen.getByRole("region", { name: "Résultats commerciaux" });
    expect(within(attribution).getByRole("heading", { name: "Coût par nouveau client" })).toBeInTheDocument();
    expect(within(attribution).getByText("Indisponible")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("présente les contenus planifiés comme un état actuel en attente de diffusion", () => {
    mount({ autopilot: dashboard([metric("items_scheduled", 4, { label: "Contenus planifiés", group: "activity", source: "marketing_calendar_items" })]) });
    expect(screen.getByRole("heading", { name: "En attente de diffusion" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contenus planifiés" })).not.toBeInTheDocument();
    expect(screen.getByText(/Les contenus en attente sont ceux prévus dans la période, à leur état actuel/)).toBeInTheDocument();
  });

  it("affiche les monnaies fournies et ne remplace pas une observation absente par l'heure de calcul", () => {
    mount({ autopilot: dashboard([metric("revenue", 123.45, { label: "Revenu attribué", unit: "USD", source: "marketing_attribution_facts" })]) });
    const expected = new Intl.NumberFormat("fr-CH", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(123.45);
    expect(screen.getByText(expected.replace(/\s/g, " "))).toBeInTheDocument();
    expect(screen.getByText("Date d'observation non fournie")).toBeInTheDocument();
    expect(screen.queryByText(/Dernière observation/)).not.toBeInTheDocument();
  });

  it("explique une devise inconnue ou mixte sans prétendre que le revenu est absent", () => {
    const data = dashboard([
      metric("revenue", null, { label: "Revenu attribué", unavailableReason: "Devise non confirmée.", source: "marketing_attribution_facts" }),
      metric("spend", null, { label: "Dépenses", unavailableReason: "mixed_currencies", source: "marketing_attribution_facts" }),
      metric("roas", null, { label: "ROAS", unavailableReason: "mixed_currencies", source: "marketing_attribution_facts" }),
    ]);
    data.analytics.unavailableReasons = ["mixed_currencies"];
    mount({ autopilot: data });
    expect(screen.getByText("La devise de ce montant n'est pas confirmée.")).toBeInTheDocument();
    expect(screen.getByText("Plusieurs devises sont présentes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revenu / dépenses" })).toBeInTheDocument();
    expect(screen.queryByText("Aucun revenu attribué à une campagne pour cette période.")).not.toBeInTheDocument();
  });

  it("transmet les deux dates communes et masque les anciennes valeurs pour une plage invalide", () => {
    const { props, rerender } = mount({ autopilot: dashboard([metric("sent", 91, { label: "Envois" })]) });
    const start = screen.getByLabelText("Du");
    const end = screen.getByLabelText("Au");
    expect(start).toHaveValue("2026-10-01");
    expect(end).toHaveValue("2026-10-21");
    fireEvent.change(start, { target: { value: "2026-10-05" } });
    expect(props.onFiltersChange).toHaveBeenLastCalledWith({ from: "2026-10-05" });
    fireEvent.change(end, { target: { value: "2026-10-15" } });
    expect(props.onFiltersChange).toHaveBeenLastCalledWith({ to: "2026-10-15" });
    rerender(<MarketingResultsView {...props} filters={{ ...filters, from: "2026-10-22", to: "2026-10-01" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/La date de début doit précéder.+la date de fin/);
    expect(screen.getByLabelText("Du")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("91")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser les KPI" })).toBeDisabled();
  });

  it("utilise l'historique périodique confirmé plutôt que le snapshot cumulatif", () => {
    const data = dashboard([metric("sent", 7), metric("delivered", 5), metric("clicks", 2), metric("delivery_conversions", 1)]);
    data.analytics = { ...data.analytics, dailyResults: [{ date: "2026-10-10", sent: 7, delivered: 5, clicks: 2, conversions: 1 }] };
    const snapshot = { ...createFallbackMarketingSnapshot(), source: "backend" as const, results: [{ date: "2026-10-10", sent: 99, delivered: 90, clicks: 45, conversions: 19 }] };
    mount({ autopilot: data, snapshot });
    const history = screen.getByRole("region", { name: "Résultats historiques consolidés" });
    expect(within(history).getByText("7")).toBeInTheDocument();
    expect(within(history).queryByText("99")).not.toBeInTheDocument();
    expect(screen.getByText(/Même période et mêmes événements, sans doublons/)).toBeInTheDocument();
  });

  it("respecte un historique périodique vide sans réutiliser les anciens événements", () => {
    const data = dashboard();
    data.analytics = { ...data.analytics, dailyResults: [] };
    const snapshot = { ...createFallbackMarketingSnapshot(), source: "backend" as const, results: [{ date: "2026-10-10", sent: 99, delivered: 90, clicks: 45, conversions: 19 }] };
    mount({ autopilot: data, snapshot });
    expect(screen.getByText("Aucun événement confirmé dans la période")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Résultats historiques consolidés" })).not.toBeInTheDocument();
  });

  it("ne transforme pas les zéros journaliers d'un type non confirmé en KPI disponible", () => {
    const data = dashboard([metric("sent", 7), metric("delivered", null), metric("clicks", null), metric("delivery_conversions", null)]);
    data.analytics.dailyResults = [{ date: "2026-10-10", sent: 7, delivered: 0, clicks: 0, conversions: 0 }];
    mount({ autopilot: data });
    const history = screen.getByRole("region", { name: "Résultats historiques consolidés" });
    expect(within(history).getByText("7")).toBeInTheDocument();
    expect(within(history).getAllByText("Indisponible")).toHaveLength(3);
    expect(within(history).queryByText("0")).not.toBeInTheDocument();
    expect(within(history).queryByText(/Taux de/)).not.toBeInTheDocument();
  });

  it("ne divise pas les cohortes historiques différentes pour produire un taux trompeur", () => {
    const data = dashboard([metric("sent", 1), metric("delivered", 10), metric("clicks", 20), metric("delivery_conversions", 30)]);
    data.analytics.dailyResults = [{ date: "2026-10-10", sent: 1, delivered: 10, clicks: 20, conversions: 30 }];
    mount({ autopilot: data });
    const history = screen.getByRole("region", { name: "Résultats historiques consolidés" });
    expect(within(history).getByText("1")).toBeInTheDocument();
    expect(within(history).getByText("10")).toBeInTheDocument();
    expect(within(history).getByText("Envois distribués")).toBeInTheDocument();
    expect(within(history).getByText("Envois avec clic")).toBeInTheDocument();
    expect(within(history).queryByText(/%/)).not.toBeInTheDocument();
    expect(within(history).queryByText(/Taux de/)).not.toBeInTheDocument();
  });

  it("signale la limite de l'ancien historique et ne calcule aucun taux sans dénominateur", () => {
    const snapshot = { ...createFallbackMarketingSnapshot(), source: "backend" as const, results: [{ date: "2026-10-10", sent: 0, delivered: 0, clicks: 1, conversions: 0 }], campaigns: [{
      id: "draft", name: "Campagne préparée", objective: "Découverte", status: "draft" as const, audienceId: "", audienceName: "", channels: ["instagram" as const], startsAt: null, endsAt: null,
      sent: 0, delivered: 0, clicked: 0, conversions: 0, requiresApproval: true, content: "", approvedAt: null, updatedAt: "2026-10-20T10:00:00Z",
    }] };
    mount({ snapshot });
    expect(screen.getByText(/Historique récent limité aux 30 derniers jours/)).toBeInTheDocument();
    expect(screen.getByText("Distributions enregistrées dans la période")).toBeInTheDocument();
    expect(screen.getByText("Clics enregistrés dans la période")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Campagne préparée/ });
    expect(within(row).getAllByText("Indisponible")).toHaveLength(3);
    expect(within(row).getByText("Aucun envoi confirmé")).toBeInTheDocument();
    expect(within(row).queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText(/Cumul depuis la création de chaque campagne/)).toBeInTheDocument();
  });

  it("masque les KPI en erreur ou en chargement et permet une nouvelle lecture", () => {
    const { props, rerender } = mount({ autopilot: dashboard([metric("sent", 91, { label: "Envois" })]), autopilotError: "Lecture impossible." });
    expect(screen.queryByText("91")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Analytics indisponibles");
    fireEvent.click(screen.getByRole("button", { name: "Actualiser les KPI" }));
    expect(props.onRefreshAutopilot).toHaveBeenCalledOnce();
    rerender(<MarketingResultsView {...props} autopilotError={null} autopilotLoading />);
    expect(screen.queryByText("91")).not.toBeInTheDocument();
    expect(screen.getByText("Chargement des mesures…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser les KPI" })).toBeDisabled();
  });
});
