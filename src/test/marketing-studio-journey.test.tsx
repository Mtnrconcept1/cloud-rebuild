import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TokAiMarketingStudio from "@/components/dashboard/TokAiMarketingStudio";

const state = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), data: [], error: null };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [], error: null });
  return { query, toast: vi.fn(), generate: vi.fn(), reveal: vi.fn() };
});
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: () => state.query }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/lib/ai/aiCreationJobs", () => ({
  useAiCreationRecovery: vi.fn(), setActiveAiCreationContext: vi.fn(),
  requestAiCreationNotificationPermission: vi.fn(), startTokImageCreationJob: state.generate,
}));
vi.mock("@/components/dashboard/AiStyleReferencePicker", () => ({ default: () => <p>Référence de style</p> }));
vi.mock("@/components/ui/ai-generation-progress-dialog", () => ({ default: () => null }));
beforeEach(() => {
  state.reveal.mockClear(); state.generate.mockClear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: state.reveal });
});
afterEach(cleanup);
const actions = () => within(screen.getByRole("group", { name: "Actions de l’étape" }));
const setup = () => render(<MemoryRouter><TokAiMarketingStudio restaurantId="restaurant-test" /></MemoryRouter>);
async function goToBrief() {
  fireEvent.click(await screen.findByRole("button", { name: "Continuer vers les références marketing" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuer vers le brief" }));
}
describe("restaurant Marketing Studio journey", () => {
  it("keeps one explicit next action and reveals the destination step", async () => {
    setup();
    await waitFor(() => expect(actions().getByRole("button", { name: "Continuer vers les références marketing" })).toBeEnabled());
    expect(actions().getByText("Étape 1 sur 3")).toBeVisible();
    fireEvent.click(actions().getByRole("button", { name: "Continuer vers les références marketing" }));
    expect(actions().getByText("Étape 2 sur 3")).toBeVisible();
    expect(screen.getByLabelText("Étape 2 sur 3 : Votre marque")).toHaveFocus();
    expect(state.reveal).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(actions().getByRole("button", { name: "Retour" })).toBeEnabled();
    expect(actions().getByRole("button", { name: "Continuer vers le brief" })).toBeEnabled();
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("retains the brief when navigating back and forward", async () => {
    setup();
    await waitFor(() => expect(actions().getByRole("button", { name: "Continuer vers les références marketing" })).toBeEnabled());
    await goToBrief();
    const brief = screen.getByLabelText("Décrivez votre besoin");
    const generate = actions().getByRole("button", { name: /Générer le visuel/ });
    expect(generate).toBeDisabled();
    fireEvent.change(brief, { target: { value: "Un flyer gourmand pour notre nouvelle carte de saison" } });
    expect(generate).toBeEnabled();
    fireEvent.click(actions().getByRole("button", { name: "Retour" }));
    fireEvent.click(actions().getByRole("button", { name: "Continuer vers le brief" }));
    expect(brief).toHaveValue("Un flyer gourmand pour notre nouvelle carte de saison");
    expect(screen.getByText("Vérifier les paramètres et références du visuel").closest("details")).not.toHaveAttribute("open");
    expect(state.generate).not.toHaveBeenCalled();
  });
});
