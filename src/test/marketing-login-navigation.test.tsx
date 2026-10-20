import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingProtectedRoute from "@/components/marketing/MarketingProtectedRoute";
import MarketingLogin from "@/pages/marketing/MarketingLogin";
import { ensureSeoMetadataForRoute } from "@/hooks/useSeoMeta";
import { marketingLoginReturnTarget } from "@/marketing/useMarketingUrlState";

const { session } = vi.hoisted(() => ({ session: {
  status: "unauthenticated", enrollment: null, submitting: false, error: null,
  refreshSession: vi.fn(), login: vi.fn(), verifyTotp: vi.fn(), clearError: vi.fn(),
} }));
vi.mock("@/marketing/MarketingSessionContext", () => ({ useMarketingSession: () => session }));

const target = "/marketing?view=calendar&campaignId=82450000-0000-4000-8000-000000000001&itemId=82450000-0000-4000-8000-000000000002&from=2026-11-01&to=2026-11-30";

beforeEach(() => { session.status = "unauthenticated"; vi.clearAllMocks(); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("marketing login return navigation", () => {
  it("preserves a protected review destination through the isolated login", async () => {
    const router = createMemoryRouter([
      { path: "/marketing", element: <MarketingProtectedRoute><p>Espace marketing</p></MarketingProtectedRoute> },
      { path: "/marketing/login", element: <MarketingLogin /> },
    ], { initialEntries: [target] });
    render(<RouterProvider router={router} />);
    await screen.findByLabelText("Adresse e-mail administrateur");
    expect(router.state.location.pathname).toBe("/marketing/login");
    expect(router.state.location.state).toEqual({ marketingReturnTo: marketingLoginReturnTarget(target) });
    expect(screen.queryByText("Espace marketing")).not.toBeInTheDocument();
  });

  it("returns an authenticated administrator to the exact review destination", async () => {
    session.status = "authenticated";
    const router = createMemoryRouter([
      { path: "/marketing/login", element: <MarketingLogin /> },
      { path: "/marketing", element: <p>Revue marketing</p> },
    ], { initialEntries: [{ pathname: "/marketing/login", state: { marketingReturnTo: target } }] });
    render(<RouterProvider router={router} />);
    await screen.findByText("Revue marketing");
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(marketingLoginReturnTarget(target));
  });

  it("restores the query-carried target after an expired request and page reload", async () => {
    session.status = "authenticated";
    const router = createMemoryRouter([
      { path: "/marketing/login", element: <MarketingLogin /> },
      { path: "/marketing", element: <p>Revue marketing</p> },
    ], { initialEntries: [`/marketing/login?returnTo=${encodeURIComponent(target)}`] });
    render(<RouterProvider router={router} />);
    await screen.findByText("Revue marketing");
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(marketingLoginReturnTarget(target));
  });

  it("uses the validated destination after a successful MFA submission", async () => {
    session.status = "challenge-mfa";
    session.verifyTotp.mockResolvedValue(true);
    const router = createMemoryRouter([
      { path: "/marketing/login", element: <MarketingLogin /> },
      { path: "/marketing", element: <p>Revue marketing</p> },
    ], { initialEntries: [{ pathname: "/marketing/login", state: { marketingReturnTo: target } }] });
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText("Code de sécurité"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier le code" }));
    await screen.findByText("Revue marketing");
    expect(session.verifyTotp).toHaveBeenCalledWith("123456");
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(marketingLoginReturnTarget(target));
  });

  it("passes the explicit remember-session choice to the isolated login", async () => {
    session.login.mockResolvedValue(false);
    const router = createMemoryRouter([
      { path: "/marketing/login", element: <MarketingLogin /> },
    ], { initialEntries: ["/marketing/login"] });
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText("Adresse e-mail administrateur"), {
      target: { value: "admin@thetok.ch" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Secret123!" },
    });
    expect(screen.getByLabelText("Rester connecté sur cet appareil")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Rester connecté sur cet appareil"));
    fireEvent.click(screen.getByRole("button", { name: "Continuer en sécurité" }));

    await waitFor(() => {
      expect(session.login).toHaveBeenCalledWith(
        "admin@thetok.ch",
        "Secret123!",
        true,
      );
    });
  });

  it.each([
    "https://evil.example/marketing", "//evil.example/marketing", "/admin", "/marketing/login", "/marketing/../admin",
    "/marketing?view=calendar#access_token=secret", "javascript:alert(1)", { path: "/marketing" },
  ])("rejects unsafe login return targets: %j", (value) => {
    expect(marketingLoginReturnTarget(value)).toBe("/marketing");
  });

  it("strips unknown and authentication parameters from a local return link", () => {
    const safe = marketingLoginReturnTarget("/marketing?view=calendar&code=secret&next=https%3A%2F%2Fevil.example&itemId=invalid");
    expect(safe).toBe("/marketing?view=calendar");
  });

  it("sets private marketing metadata without letting the route fallback overwrite it", async () => {
    window.history.replaceState(null, "", "/marketing/login");
    const router = createMemoryRouter([{ path: "/marketing/login", element: <MarketingLogin /> }], { initialEntries: ["/marketing/login"] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(document.title).toBe("Connexion marketing sécurisée · TheTOK"));
    ensureSeoMetadataForRoute("/marketing/login");
    expect(document.title).toBe("Connexion marketing sécurisée · TheTOK");
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow,noarchive");
  });
});
