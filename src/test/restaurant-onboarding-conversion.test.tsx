// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.thetok.ch/restaurateurs/geneve"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RestaurateursGeneve from "@/pages/RestaurateursGeneve";
import { submitContactSupport } from "@/lib/support/contactSupport";
import { readStoredFirstTouch } from "@/lib/acquisitionAttribution";
import { hasConsent } from "@/lib/consent";

vi.mock("@/hooks/useSeoMeta", () => ({ useSeoMeta: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/support/contactSupport", () => ({ submitContactSupport: vi.fn() }));
vi.mock("@/lib/acquisitionAttribution", () => ({ readStoredFirstTouch: vi.fn() }));
vi.mock("@/lib/consent", () => ({ hasConsent: vi.fn(() => false) }));
vi.mock("@/components/security/TurnstileCaptcha", () => ({ default: () => null }));
vi.mock("@/lib/captcha", () => ({ isCaptchaEnabled: () => false }));

const leadId = "550e8400-e29b-41d4-a716-446655440000";

function renderJourney() {
  const view = render(<MemoryRouter initialEntries={["/restaurateurs/geneve"]}><RestaurateursGeneve /></MemoryRouter>);
  const form = view.container.querySelector<HTMLFormElement>("#demande-demo");
  if (!form) throw new Error("Restaurant demo form missing");
  fireEvent.change(screen.getByLabelText("Nom du restaurant"), { target: { value: "Bistro Test Isolé" } });
  fireEvent.change(screen.getByLabelText("Téléphone"), { target: { value: "+41 22 555 01 01" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bistro-test@example.invalid" } });
  return form;
}

beforeEach(() => {
  vi.mocked(submitContactSupport).mockReset().mockResolvedValue({ ok: true, restaurantLeadId: leadId });
  vi.mocked(hasConsent).mockReturnValue(false);
  vi.mocked(readStoredFirstTouch).mockReturnValue(null);
  if (!("randomUUID" in globalThis.crypto)) {
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => leadId });
  }
});
afterEach(cleanup);

describe("TOK restaurateur acquisition journey (no real outbound message)", () => {
  it("exposes the real registration route beside a free demo, and records no implicit opt-in", async () => {
    const form = renderJourney();
    expect(screen.getByRole("link", { name: /Créer mon compte restaurateur/i })).toHaveAttribute("href", "/auth?role=restaurateur");
    expect(screen.getByLabelText(/J’accepte de recevoir des nouvelles et offres TOK/)).not.toBeChecked();

    fireEvent.submit(form);
    await waitFor(() => expect(submitContactSupport).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(submitContactSupport).mock.calls[0][0];
    expect(payload.name).toBe("Bistro Test Isolé");
    expect(payload.email).toBe("bistro-test@example.invalid");
    expect(payload.restaurantLead?.marketingConsent).toBe(false);
    expect(payload.restaurantLead?.marketingTrackingConsent).toBe(false);
    expect(payload.restaurantLead?.acquisitionTouch).toBeNull();
    expect(screen.getByTestId("restaurant-demo-confirmation")).toHaveTextContent("demande de démo est enregistrée");
    expect(screen.getAllByRole("link", { name: /Créer mon compte restaurateur/i })).toHaveLength(2);
  });

  it("keeps email marketing opt-in separate from a visitor's tracking preference", async () => {
    vi.mocked(hasConsent).mockReturnValue(true);
    vi.mocked(readStoredFirstTouch).mockReturnValue({
      utm: { utm_source: "instagram", utm_medium: "social", utm_campaign: "restos_geneve" },
      referrerHost: "instagram.com",
      landingPath: "/restaurateurs/geneve",
      touchedAt: new Date().toISOString(),
      boundUserIds: [],
    });
    const form = renderJourney();
    fireEvent.click(screen.getByLabelText(/J’accepte de recevoir des nouvelles et offres TOK/));
    fireEvent.submit(form);

    await waitFor(() => expect(submitContactSupport).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(submitContactSupport).mock.calls[0][0];
    expect(payload.restaurantLead?.marketingConsent).toBe(true);
    expect(payload.restaurantLead?.marketingTrackingConsent).toBe(true);
    expect(payload.restaurantLead?.acquisitionTouch?.utm.utm_campaign).toBe("restos_geneve");
    expect(payload.restaurantLead?.acquisitionTouch).not.toHaveProperty("boundUserIds");
  });

  it("does not show a false success after a server error, and allows a retry", async () => {
    vi.mocked(submitContactSupport).mockRejectedValueOnce(new Error("service_unavailable"))
      .mockResolvedValueOnce({ ok: true, restaurantLeadId: leadId });
    const form = renderJourney();
    fireEvent.submit(form);
    await waitFor(() => expect(submitContactSupport).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("restaurant-demo-confirmation")).not.toBeInTheDocument();
    fireEvent.submit(form);
    await waitFor(() => expect(submitContactSupport).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("restaurant-demo-confirmation")).toBeInTheDocument();
    expect(vi.mocked(submitContactSupport).mock.calls[0][0].restaurantLead?.requestId)
      .toBe(vi.mocked(submitContactSupport).mock.calls[1][0].restaurantLead?.requestId);
  });
});
