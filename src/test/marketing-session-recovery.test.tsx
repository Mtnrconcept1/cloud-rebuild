import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingProtectedRoute from "@/components/marketing/MarketingProtectedRoute";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem } from "@/marketing/marketingClient";
import MarketingSessionProvider from "@/marketing/MarketingSessionProvider";
import { useMarketingSession } from "@/marketing/MarketingSessionContext";
import { MARKETING_SESSION_EXPIRED_EVENT, MarketingBffError } from "@/marketing/marketingBffClient";
import { useMarketingUrlState } from "@/marketing/useMarketingUrlState";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingBffClient")>(),
  marketingBffRequest: request,
}));

describe("marketing MFA recovery", () => {
  beforeEach(() => request.mockReset());
  afterEach(cleanup);

  async function startChallenge() {
    request.mockResolvedValueOnce({ authenticated: false });
    const hook = renderHook(useMarketingSession, { wrapper: MarketingSessionProvider });
    await waitFor(() => expect(hook.result.current.status).toBe("unauthenticated"));
    request.mockResolvedValueOnce({ status: "mfa_required" });
    await act(async () => { await hook.result.current.login("admin@example.com", "password123", false); });
    expect(hook.result.current.status).toBe("challenge-mfa");
    return hook;
  }

  it("returns to credentials when the pending challenge expires", async () => {
    const { result } = await startChallenge();
    request.mockRejectedValueOnce(new MarketingBffError("ignored", 401, "authentication_required"));
    await act(async () => { expect(await result.current.verifyTotp("123456")).toBe(false); });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.error).toContain("identifiants");
  });

  it.each([
    [401, "mfa_failed", "Code invalide"],
    [429, undefined, "Trop de tentatives"],
    [503, undefined, "Service de vérification indisponible"],
  ])("preserves the MFA form and explains status %s", async (status, code, message) => {
    const { result } = await startChallenge();
    request.mockRejectedValueOnce(new MarketingBffError("ignored", status, code));
    await act(async () => { await result.current.verifyTotp("123456"); });
    expect(result.current.status).toBe("challenge-mfa");
    expect(result.current.error).toContain(message);
  });

  it("enters the secured workspace on the first valid MFA submission without an extra session request", async () => {
    const { result } = await startChallenge();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    request.mockResolvedValueOnce({
      status: "authenticated",
      session: { authenticated: true, admin: true, aal: "aal2", expiresAt },
    });

    await act(async () => { expect(await result.current.verifyTotp("123456")).toBe(true); });
    expect(result.current.status).toBe("authenticated");
    expect(result.current.expiresAt).toBe(expiresAt);
    expect(result.current.error).toBeNull();
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/mfa/verify")).toHaveLength(1);
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/session")).toHaveLength(1);
  });

  it("fails closed on a malformed MFA success response, then recovers without consuming the code again", async () => {
    const { result } = await startChallenge();
    request.mockResolvedValueOnce({ status: "authenticated" });
    await act(async () => { expect(await result.current.verifyTotp("123456")).toBe(false); });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("vérifier la session");

    request.mockResolvedValueOnce({ authenticated: true, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await act(async () => { await result.current.refreshSession(); });
    expect(result.current.status).toBe("authenticated");
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/mfa/verify")).toHaveLength(1);
  });
});

describe("marketing session focus recovery", () => {
  let documentFocused = true;
  let visibility: DocumentVisibilityState = "visible";
  const campaignId = "82450000-0000-4000-8000-000000000001";
  const itemId = "82450000-0000-4000-8000-000000000002";
  const initialReview = `/marketing?view=calendar&from=2026-10-01&to=2026-10-31&campaignId=${campaignId}&itemId=${itemId}`;

  beforeEach(() => {
    request.mockReset();
    request.mockImplementation((path, options) => {
      if (path === "/api/marketing/orchestrator" && options?.body?.action === "content_review_status") {
        return Promise.resolve({ target_type: "campaign", target_id: campaignId, revision: 1,
          status: "queued", updated_at: "2026-10-21T09:00:00Z", review: null });
      }
      return new Promise(() => {});
    });
    documentFocused = true;
    visibility = "visible";
    vi.spyOn(document, "hasFocus").mockImplementation(() => documentFocused);
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function authenticatedSession() {
    return { authenticated: true, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }

  function deferredSession() {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function EmailReview() {
    const { state, setView, update } = useMarketingUrlState();
    if (state.view === "campaigns") return <h1>Campagne à relire</h1>;
    const snapshot = createFallbackMarketingSnapshot();
    snapshot.source = "backend";
    snapshot.campaigns = [{
      id: campaignId, name: "Campagne pizzerias", objective: "Faire découvrir TOK", status: "draft", channels: ["email"],
      audienceId: "", audienceName: "Pizzerias", startsAt: "2026-10-21T09:00:00Z", endsAt: null, sent: 0,
      delivered: 0, clicked: 0, conversions: 0, requiresApproval: true, content: "Découvrez TOK",
      approvedAt: null, updatedAt: "2026-10-19T12:00:00Z",
    }];
    snapshot.calendar = [normalizeCalendarItem({
      id: itemId, campaign_id: campaignId, campaign_name: "Campagne pizzerias", title: "E-mail pizzerias",
      channel: "email", scheduled_at: "2026-10-21T09:00:00Z", status: "draft", approval_status: "pending",
      content: { mailing_version: "tok-mailing-v1", subject: "Découvrez TOK", headline: "Pour votre pizzeria",
        body: "Découvrez les outils TOK.", call_to_action: "Découvrir TOK", visual_status: "ready",
        visual_url: "https://assets.example.test/pizzeria.png" },
    })];
    return <MarketingCalendarView snapshot={snapshot} filters={state} canMutateBackend pendingAction={null}
      onFiltersChange={update} onNavigate={setView} onApprove={vi.fn()} onCancel={vi.fn()} onCompleteManual={vi.fn()} />;
  }

  async function startReview() {
    request.mockResolvedValueOnce(authenticatedSession());
    const router = createMemoryRouter([
      { path: "/marketing", element: <MarketingProtectedRoute><EmailReview /></MarketingProtectedRoute> },
      { path: "/marketing/login", element: <h1>Connexion marketing</h1> },
    ], { initialEntries: [initialReview] });
    render(<MarketingSessionProvider><RouterProvider router={router} /></MarketingSessionProvider>);
    await screen.findByRole("button", { name: "Relire et approuver la campagne" });
    await screen.findByText("En file d’attente");
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/orchestrator")).toEqual([
      ["/api/marketing/orchestrator", expect.objectContaining({ method: "POST", requireCsrf: true,
        body: { action: "content_review_status", targetType: "campaign", targetId: campaignId } })],
    ]);
    return router;
  }

  async function startSession() {
    request.mockResolvedValueOnce(authenticatedSession());
    const hook = renderHook(useMarketingSession, { wrapper: MarketingSessionProvider });
    await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
    return hook;
  }

  function leaveWindow() {
    documentFocused = false;
    fireEvent.blur(window);
  }

  function returnToWindow() {
    documentFocused = true;
    fireEvent.focus(window);
  }

  it("keeps the real campaign navigation button mounted when focus returns from its email iframe", async () => {
    const router = await startReview();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    const iframe = screen.getByTitle("Template e-mail — E-mail pizzerias");
    act(() => { iframe.focus(); fireEvent.blur(window); });
    expect(document.activeElement).toBe(iframe);
    const button = screen.getByRole("button", { name: "Relire et approuver la campagne" });

    // An iframe-to-parent transition emits window.focus before the button click,
    // while the top-level document retains system focus throughout.
    fireEvent.focus(window);
    expect(button).toBeInTheDocument();
    expect(screen.queryByText("Vérification de la session marketing")).not.toBeInTheDocument();
    fireEvent.click(button);
    await screen.findByRole("heading", { name: "Campagne à relire" });
    expect(new URLSearchParams(router.state.location.search).get("view")).toBe("campaigns");
    expect(new URLSearchParams(router.state.location.search).get("campaignId")).toBe(campaignId);
    expect(new URLSearchParams(router.state.location.search).get("itemId")).toBe(itemId);
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/session")).toHaveLength(1);
  });

  it("blocks the protected review on a real window return even while its iframe remains the active element", async () => {
    const router = await startReview();
    const iframe = screen.getByTitle("Template e-mail — E-mail pizzerias");
    act(() => { iframe.focus(); fireEvent.blur(window); });
    expect(document.activeElement).toBe(iframe);
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);

    leaveWindow();
    expect(document.activeElement).toBe(iframe);
    returnToWindow();
    expect(screen.getByText("Vérification de la session marketing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relire et approuver la campagne" })).not.toBeInTheDocument();
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/session")).toHaveLength(2);
    await act(async () => { pending.resolve(authenticatedSession()); });
    expect(screen.getByRole("button", { name: "Relire et approuver la campagne" })).toBeInTheDocument();
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(initialReview);
  });

  it("revalidates a hidden tab once when visibility and focus return together", async () => {
    const { result } = await startSession();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    visibility = "hidden";
    documentFocused = false;
    fireEvent(document, new Event("visibilitychange"));
    visibility = "visible";
    documentFocused = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new FocusEvent("focus"));
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("loading");
    await act(async () => { pending.resolve(authenticatedSession()); });
    expect(result.current.status).toBe("authenticated");
    fireEvent.focus(window);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("revalidates on first return when authentication completed in an inactive window", async () => {
    documentFocused = false;
    const { result } = await startSession();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    returnToWindow();
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("loading");
    await act(async () => { pending.resolve(authenticatedSession()); });
    expect(result.current.status).toBe("authenticated");
  });

  it("keeps protected content blocked when window-return validation fails", async () => {
    await startReview();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    leaveWindow();
    returnToWindow();
    await act(async () => { pending.reject(new MarketingBffError("ignored", 503)); });
    expect(screen.getByRole("heading", { name: "Session indisponible" })).toBeInTheDocument();
    expect(screen.queryByTitle("Template e-mail — E-mail pizzerias")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relire et approuver la campagne" })).not.toBeInTheDocument();
  });

  it("returns to login when the server rejects a previously authenticated session", async () => {
    const router = await startReview();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    leaveWindow();
    returnToWindow();
    await act(async () => { pending.resolve({ authenticated: false }); });
    expect(screen.getByRole("heading", { name: "Connexion marketing" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/marketing/login");
    expect(router.state.location.state.marketingReturnTo).toContain(`itemId=${itemId}`);
  });

  it("does not reopen access from a late validation response after a session-expired event", async () => {
    const { result } = await startSession();
    const pending = deferredSession();
    request.mockReturnValueOnce(pending.promise);
    leaveWindow();
    returnToWindow();
    expect(result.current.status).toBe("loading");
    fireEvent(window, new Event(MARKETING_SESSION_EXPIRED_EVENT));
    expect(result.current.status).toBe("unauthenticated");
    await act(async () => { pending.resolve(authenticatedSession()); });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.expiresAt).toBeNull();
  });

  it("locks at the server expiry even without a real focus loss", async () => {
    const { result } = await startSession();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    vi.useFakeTimers();
    request.mockResolvedValueOnce({ authenticated: true, expiresAt });
    await act(async () => { await result.current.refreshSession(); });
    fireEvent.blur(window);
    fireEvent.focus(window);
    expect(result.current.status).toBe("authenticated");
    expect(request).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.expiresAt).toBeNull();
  });
});
