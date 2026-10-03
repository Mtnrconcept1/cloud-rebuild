import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { bffRequest } = vi.hoisted(() => ({ bffRequest: vi.fn() }));

vi.mock("@/marketing/marketingBffClient", () => {
  class MockMarketingBffError extends Error {
    readonly status: number;

    constructor(message: string, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return {
    MARKETING_BFF_ENDPOINTS: { rpc: "/api/marketing/rpc" },
    MarketingBffError: MockMarketingBffError,
    marketingBffRequest: bffRequest,
  };
});

import {
  normalizeMarketingAutopilotDashboard,
  prepareMarketingAutomationAction,
  simulateMarketingAutomation,
} from "@/marketing/autopilotClient";
import {
  MARKETING_AUTOMATION_TEMPLATES,
  MARKETING_AUTOPILOT_MISSING_DECISIONS,
  createFallbackMarketingAutopilotDashboard,
} from "@/marketing/autopilotTypes";
import { MarketingBffError } from "@/marketing/marketingBffClient";
import { useMarketingAutopilot } from "@/marketing/useMarketingAutopilot";
import { useMarketingUrlState } from "@/marketing/useMarketingUrlState";

function UrlStateHarness() {
  const { state, setView } = useMarketingUrlState();
  return (
    <div>
      <output aria-label="état URL">{state.view}:{state.query}</output>
      <button type="button" onClick={() => setView("governance")}>Gouvernance</button>
    </div>
  );
}

describe("frontend TOK Marketing Autopilot", () => {
  beforeEach(() => {
    bffRequest.mockReset();
  });

  it("expose exactement les huit modèles TOK et un repli fail-closed", () => {
    expect(MARKETING_AUTOMATION_TEMPLATES.map((template) => template.key)).toEqual([
      "tok.zero_attente",
      "tok.ventes_flash",
      "tok.anti_gaspillage",
      "tok.print_studio",
      "tok.plan_salle",
      "tok.tok_social",
      "tok.publicites_ia",
      "tok.comptabilite_ia",
    ]);
    const fallback = createFallbackMarketingAutopilotDashboard();
    expect(fallback.governance).toMatchObject({
      autonomyLevel: 0,
      globalPaused: true,
      approvalRequired: true,
      externalActionsBlocked: true,
    });
    expect(fallback.governance.missingDecisions).toHaveLength(MARKETING_AUTOPILOT_MISSING_DECISIONS.length);
  });

  it("normalise le dashboard SQL sans confondre fournisseur, droits ou KPI absents", () => {
    const dashboard = normalizeMarketingAutopilotDashboard({
      generated_at: "2026-10-03T10:00:00Z",
      governance: {
        global_paused: false,
        approval_required: true,
        draft_only: true,
        external_actions_enabled: false,
        max_campaign_autonomy_level: 1,
      },
      providers: [{
        provider: "metricool",
        display_name: "Metricool",
        provider_kind: "social",
        capabilities: ["schedule"],
        granted_scopes: ["analytics.read"],
        control_state: "paused",
        observed_state: "ready",
        last_probe_at: "2026-10-03T09:55:00Z",
        control_reason: "Canari non approuvé",
      }],
      automations: [{
        automation_key: "tok.zero_attente",
        template_key: "tok.zero_attente",
        name: "Zéro attente",
        template_enabled: false,
        status: "disabled",
      }],
      assets: { total: 5, approved: 2, with_current_rights: 1 },
      analytics: {
        sent: 0,
        delivered: 0,
        clicked: 0,
        delivery_conversions: 0,
        leads: 3,
        business_conversions: 1,
        spend_minor: null,
        revenue_minor: 12345,
        currency: "CHF",
        cac_minor: null,
        cpl_minor: null,
        cpa_minor: null,
        roas: null,
        completeness: "partial",
        unavailable_reasons: ["spend_data_unavailable"],
      },
    });

    expect(dashboard.governance.autonomyLevel).toBe(1);
    expect(dashboard.providers[0]).toMatchObject({
      label: "Metricool",
      category: "social",
      status: "paused",
      scopes: ["analytics.read"],
    });
    expect(dashboard.automations[0]).toMatchObject({ id: "tok.zero_attente", status: "disabled" });
    expect(dashboard.assets).toMatchObject({ approved: 2, withCurrentRights: 1, pendingRights: 4 });
    expect(dashboard.analytics.completeness).toBe(0.5);
    expect(dashboard.analytics.metrics.find((metric) => metric.key === "spend")?.value).toBeNull();
    expect(dashboard.analytics.metrics.find((metric) => metric.key === "cac")?.value).toBeNull();
    expect(dashboard.analytics.metrics.find((metric) => metric.key === "revenue")?.value).toBe(123.45);
  });

  it("autorise la préparation d'un brouillon après une simulation de modèle désactivé, sans effet externe", async () => {
    const simulationKey = "a".repeat(64);
    const clientRequestId = "11111111-1111-4111-8111-111111111111";
    bffRequest.mockResolvedValueOnce({
      simulation_key: simulationKey,
      automation_key: "tok.zero_attente",
      template_enabled: false,
      automation_status: "disabled",
      action_type: "draft_campaign",
      external_effect: false,
    });
    const input = { threshold: 5 };
    const simulation = await simulateMarketingAutomation("tok.zero_attente", input);
    expect(simulation.status).toBe("simulated");
    expect(simulation.warnings.join(" ")).toContain("Modèle désactivé");
    expect(bffRequest).toHaveBeenLastCalledWith("/api/marketing/rpc", {
      body: {
        operation: "admin_simulate_marketing_automation",
        args: { p_automation_key: "tok.zero_attente", p_input: input },
      },
    });

    bffRequest.mockResolvedValueOnce({ id: "action-1", run_id: "run-1", status: "draft", external_effect: false });
    await prepareMarketingAutomationAction({
      automationKey: simulation.templateKey,
      automationInput: simulation.input,
      simulationKey,
      clientRequestId,
      reason: "Revue opérateur validée",
    });
    const prepareArgs = bffRequest.mock.calls[bffRequest.mock.calls.length - 1]?.[1]?.body.args;
    expect(prepareArgs).toMatchObject({
      p_automation_key: "tok.zero_attente",
      p_input: input,
      p_client_request_id: clientRequestId,
      p_simulation_key: simulationKey,
      p_reason: "Revue opérateur validée",
    });
  });

  it("refuse un brouillon si le backend ne confirme pas explicitement l'absence d'effet externe", async () => {
    bffRequest.mockResolvedValueOnce({
      id: "action-unsafe",
      run_id: "run-unsafe",
      status: "draft",
      external_effect: true,
    });

    await expect(prepareMarketingAutomationAction({
      automationKey: "tok.zero_attente",
      automationInput: {},
      simulationKey: "c".repeat(64),
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      reason: "Revue opérateur validée",
    })).rejects.toThrow("absence d'effet externe");
  });

  it("réutilise le reçu et le client_request_id après une réponse réseau perdue", async () => {
    const simulationKey = "b".repeat(64);
    let prepareCount = 0;
    const dashboard = {
      generated_at: "2026-10-03T10:00:00Z",
      governance: { global_paused: true, approval_required: true, external_actions_enabled: false },
      providers: [],
      automations: [],
      assets: { total: 0, approved: 0, with_current_rights: 0 },
      analytics: null,
      completeness: "unavailable",
      unavailable_reasons: ["delivery_events_unavailable"],
    };
    bffRequest.mockImplementation((_path, options) => {
      if (!options?.body) throw new Error(`Appel BFF sans options : ${String(_path)}`);
      const operation = options.body.operation;
      if (operation === "admin_get_marketing_autopilot_dashboard") return Promise.resolve(dashboard);
      if (operation === "admin_simulate_marketing_automation") {
        return Promise.resolve({
          simulation_key: simulationKey,
          automation_key: "tok.zero_attente",
          template_enabled: false,
          automation_status: "disabled",
          action_type: "draft_campaign",
          external_effect: false,
        });
      }
      if (operation === "admin_prepare_marketing_automation_action") {
        prepareCount += 1;
        if (prepareCount === 1) return Promise.reject(new MarketingBffError("Réponse perdue", 503));
        return Promise.resolve({ id: "action-1", run_id: "run-1", status: "draft", external_effect: false });
      }
      throw new Error(`Opération inattendue : ${operation}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarketingAutopilot(), { wrapper });
    await waitFor(() => expect(result.current.dashboard.source).toBe("backend"));
    await act(async () => { await result.current.simulate("tok.zero_attente"); });
    await act(async () => { await result.current.prepareDraft("Revue opérateur validée"); });
    expect(result.current.notice?.tone).toBe("warning");
    expect(result.current.simulation?.id).toBe(simulationKey);
    await act(async () => { await result.current.prepareDraft("Revue opérateur validée"); });
    expect(result.current.simulation).toBeNull();

    const prepareCalls = bffRequest.mock.calls
      .map((call) => call[1]?.body)
      .filter((body) => body?.operation === "admin_prepare_marketing_automation_action");
    expect(prepareCalls).toHaveLength(2);
    expect(prepareCalls[0].args.p_client_request_id).toBe(prepareCalls[1].args.p_client_request_id);
    expect(prepareCalls[0].args.p_simulation_key).toBe(simulationKey);
    expect(prepareCalls[1].args.p_simulation_key).toBe(simulationKey);
    expect(prepareCalls[1].args.p_input).toEqual(prepareCalls[0].args.p_input);
    expect(prepareCalls[1].args.p_reason).toBe(prepareCalls[0].args.p_reason);
  });

  it("ajoute un historique lors d'un changement de vue et respecte le retour navigateur", async () => {
    const router = createMemoryRouter([{ path: "/", element: <UrlStateHarness /> }], {
      initialEntries: ["/?q=restaurant"],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByLabelText("état URL")).toHaveTextContent("overview:restaurant");
    fireEvent.click(screen.getByRole("button", { name: "Gouvernance" }));
    await waitFor(() => expect(screen.getByLabelText("état URL")).toHaveTextContent("governance:"));
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(screen.getByLabelText("état URL")).toHaveTextContent("overview:restaurant"));
  });
});
