import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bffRequest } = vi.hoisted(() => ({ bffRequest: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => {
  class MockMarketingBffError extends Error {
    constructor(message: string, readonly status = 0) { super(message); }
  }
  return { MARKETING_BFF_ENDPOINTS: { rpc: "/api/marketing/rpc" }, MarketingBffError: MockMarketingBffError, marketingBffRequest: bffRequest };
});

import { MarketingDailySeries } from "@/components/marketing/MarketingDailySeries";
import { normalizeMarketingDailySeriesDashboard, updateMarketingDailySeries } from "@/marketing/dailySeriesClient";
import { MarketingBffError } from "@/marketing/marketingBffClient";

const seriesId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const campaignId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";

function fixture(seriesPatch: Record<string, unknown> = {}, rootPatch: Record<string, unknown> = {}) {
  return {
    series: { id: seriesId, key: "tok-instagram", status: "paused", channel: "instagram", timezone: "Europe/Zurich",
      local_time: "10:00", format: "4:5", version: 1, requires_approval: true, owner_authorized: false,
      generated_count: 0, next_run_at: null, last_run_at: null, activated_at: null, ...seriesPatch },
    recent_runs: [], runtime_enabled: true, scheduler_ready: true, ...rootPatch,
  };
}

const clients: QueryClient[] = [];
function mount(canMutateBackend = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const onNavigate = vi.fn();
  render(<QueryClientProvider client={client}><MarketingDailySeries canMutateBackend={canMutateBackend} onNavigate={onNavigate} /></QueryClientProvider>);
  return { client, onNavigate };
}

beforeEach(() => { bffRequest.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("série Instagram quotidienne", () => {
  it.each([
    { requires_approval: false }, { format: "9:16" }, { channel: "facebook" }, { timezone: "UTC" },
    { version: 0 }, { status: "published" }, { local_time: "25:00" },
  ])("refuse un contrat serveur incompatible sans afficher une fausse série active : %o", (patch) => {
    expect(() => normalizeMarketingDailySeriesDashboard(fixture(patch))).toThrow("n’a pas pu être confirmé");
  });

  it("borne l’historique et retire les images et cibles de navigation invalides", () => {
    const response = fixture({}, { recent_runs: Array.from({ length: 35 }, () => ({ id: runId,
      status: "succeeded", local_date: "2026-10-20", title: "Une réservation simple", attempt_count: 1,
      calendar_item_id: "javascript:alert(1)", campaign_id: campaignId, image_url: "http://unsafe.example/post.jpg" })) });
    const normalized = normalizeMarketingDailySeriesDashboard(response);
    expect(normalized.recentRuns).toHaveLength(30);
    expect(normalized.recentRuns[0]).toMatchObject({ calendarItemId: null, campaignId, imageUrl: null });
  });

  it("ne lance aucune requête ni activation si le backend de l’espace est indisponible", () => {
    mount(false);
    expect(screen.getByText("Connexion marketing à vérifier")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activer la série" })).not.toBeInTheDocument();
    expect(bffRequest).not.toHaveBeenCalled();
  });

  it("active un brouillon quotidien à l’heure choisie puis met la série en pause avec la version confirmée", async () => {
    let current = fixture();
    bffRequest.mockImplementation((_path, options) => {
      if (options.body.operation === "admin_get_marketing_daily_series") return Promise.resolve(current);
      const input = options.body.args.p_payload;
      current = fixture({ ...current.series, status: input.status, local_time: input.local_time,
        version: current.series.version + 1, owner_authorized: true, activated_at: "2026-10-19T20:00:00Z" });
      return Promise.resolve(current);
    });
    mount();
    const activate = await screen.findByRole("button", { name: "Activer la série" });
    expect(screen.getByText(/Validez chaque post pour le publier sur Instagram/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Heure de génération"), { target: { value: "11:30" } });
    fireEvent.click(activate);
    const pause = await screen.findByRole("button", { name: "Mettre en pause" });
    await waitFor(() => expect(pause).toBeEnabled());
    expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", { body: {
      operation: "admin_upsert_marketing_daily_series",
      args: { p_payload: { status: "active", local_time: "11:30", expected_version: 1 } },
    } });
    fireEvent.click(pause);
    await screen.findByRole("button", { name: "Reprendre la série" });
    expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", { body: {
      operation: "admin_upsert_marketing_daily_series",
      args: { p_payload: { status: "paused", local_time: "11:30", expected_version: 2 } },
    } });
    expect(bffRequest.mock.calls.map((call) => call[1].body.operation).join(" ")).not.toMatch(/publish|approve|launch|orchestrator/);
  });

  it.each([{ runtime_enabled: false }, { scheduler_ready: false }])("empêche l’activation quand un service n’est pas prêt : %o", async (patch) => {
    bffRequest.mockResolvedValue(fixture({}, patch));
    mount();
    expect(await screen.findByRole("button", { name: "Activer la série" })).toBeDisabled();
    expect(screen.getByText("Génération quotidienne en attente")).toBeInTheDocument();
  });

  it("permet de mettre en pause une série active même si son moteur est indisponible", async () => {
    bffRequest.mockResolvedValue(fixture({ status: "active", owner_authorized: true }, { runtime_enabled: false }));
    mount();
    expect(await screen.findByRole("button", { name: "Mettre en pause" })).toBeEnabled();
  });

  it("préserve une heure non enregistrée en cas de conflit et exige une relecture avant de réessayer", async () => {
    let reads = 0;
    bffRequest.mockImplementation((_path, options) => {
      if (options.body.operation === "admin_get_marketing_daily_series") {
        reads += 1;
        return Promise.resolve(fixture(reads === 1 ? {} : { version: 2, local_time: "11:00" }));
      }
      return Promise.reject(new MarketingBffError("Conflit", 409));
    });
    mount();
    await screen.findByRole("button", { name: "Activer la série" });
    const input = screen.getByLabelText("Heure de génération");
    fireEvent.change(input, { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l’heure" }));
    const reload = await screen.findByRole("button", { name: "Recharger les réglages" });
    expect(input).toHaveValue("12:30");
    expect(screen.getByRole("button", { name: "Activer la série" })).toBeDisabled();
    fireEvent.click(reload);
    await waitFor(() => expect(input).toHaveValue("11:00"));
    fireEvent.change(input, { target: { value: "12:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l’heure" }));
    await waitFor(() => expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", { body: {
      operation: "admin_upsert_marketing_daily_series",
      args: { p_payload: { status: "paused", local_time: "12:30", expected_version: 2 } },
    } }));
  });

  it("ouvre exactement le brouillon produit et indique les prochaines tentatives sans exposer d’erreur brute", async () => {
    bffRequest.mockResolvedValue(fixture({ generated_count: 1 }, { recent_runs: [{ id: runId, local_date: "2026-10-20",
      status: "succeeded", attempt_count: 1, title: "Commandez avant d’arriver", calendar_item_id: itemId,
      campaign_id: campaignId, scheduled_at: "2026-10-20T08:00:00Z", image_url: "https://cdn.example/post.jpg" },
    { id: "55555555-5555-4555-8555-555555555555", local_date: "2026-10-21", status: "retrying", attempt_count: 1,
      last_error: "PRIVATE_GENERATOR_DETAILS", next_attempt_at: "2026-10-21T08:15:00Z" }] }));
    const { onNavigate } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Voir le post" }));
    expect(onNavigate).toHaveBeenCalledWith("calendar", { itemId, campaignId, scheduledAt: "2026-10-20T08:00:00Z" });
    expect(screen.getByText(/Nouvelle tentative :/)).toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE_GENERATOR_DETAILS/)).not.toBeInTheDocument();
  });

  it("refuse une heure invalide avant toute mutation", async () => {
    await expect(updateMarketingDailySeries({ status: "active", localTime: "25:00", expectedVersion: 1 })).rejects.toThrow("Vérifiez l’heure");
    expect(bffRequest).not.toHaveBeenCalled();
  });

  it("exige une autorisation explicite et trente minutes de préparation avant le mode automatique", async () => {
    bffRequest.mockImplementation((_path, options) => {
      if (options.body.operation === "admin_get_marketing_daily_series") return Promise.resolve(fixture({}, { publisher_ready: true }));
      const input = options.body.args.p_payload;
      return Promise.resolve(fixture({ status: input.status, local_time: input.local_time,
        publication_mode: input.publication_mode, publication_local_time: input.publication_local_time,
        publication_authorized: true, owner_authorized: true, version: 2 }, { publisher_ready: true }));
    });
    mount();
    const activate = await screen.findByRole("button", { name: "Activer la série" });
    fireEvent.change(screen.getByLabelText("Mode de publication"), { target: { value: "automatic" } });
    fireEvent.change(screen.getByLabelText("Heure de génération"), { target: { value: "15:45" } });
    expect(activate).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /J’autorise un post TOK/ }));
    expect(activate).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Heure de génération"), { target: { value: "15:00" } });
    expect(activate).toBeEnabled();
    fireEvent.click(activate);
    await screen.findByRole("button", { name: "Mettre en pause" });
    expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", { body: {
      operation: "admin_upsert_marketing_daily_series", args: { p_payload: {
        status: "active", local_time: "15:00", expected_version: 1,
        publication_mode: "automatic", publication_local_time: "16:00", authorize_auto_publication: true,
      } },
    } });
    expect(screen.getByText(/Un post par jour à 16:00, après contrôles qualité/)).toBeInTheDocument();
  });

  it("permet de suspendre une série automatique sans renouveler son autorisation ni son moteur", async () => {
    bffRequest.mockResolvedValue(fixture({ status: "active", publication_mode: "automatic", publication_authorized: false },
      { runtime_enabled: false, publisher_ready: false }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Mettre en pause" }));
    await waitFor(() => expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", { body: {
      operation: "admin_upsert_marketing_daily_series", args: { p_payload: { status: "paused", local_time: "10:00", expected_version: 1 } },
    } }));
  });
});
