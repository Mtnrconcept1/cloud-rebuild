import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WelcomePlinko from "@/components/plinko/WelcomePlinko";
import { PlinkoSessionExpiredError } from "@/lib/plinko";

const plinkoMocks = vi.hoisted(() => ({
  auth: {
    user: null as { id: string } | null,
    role: null as string | null,
    roles: [] as string[],
    loading: false,
    rolesResolved: true,
  },
  location: { pathname: "/", search: "", hash: "", state: null, key: "home" },
  navigate: vi.fn(),
  reducedMotion: false,
  startPlinkoSession: vi.fn(),
  getPlinkoStatus: vi.fn(),
  playPlinko: vi.fn(),
  claimPlinko: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => plinkoMocks.auth,
}));

vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => plinkoMocks.reducedMotion,
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useLocation: () => plinkoMocks.location,
  useNavigate: () => plinkoMocks.navigate,
}));

vi.mock("@/lib/plinko", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/plinko")>(),
  startPlinkoSession: plinkoMocks.startPlinkoSession,
  getPlinkoStatus: plinkoMocks.getPlinkoStatus,
  playPlinko: plinkoMocks.playPlinko,
  claimPlinko: plinkoMocks.claimPlinko,
}));

const availableSession = {
  ok: true,
  enabled: true,
  available: true,
  play: null,
  reward: null,
  token: "anonymous-plinko-session",
};

const tokenKey = "tok:plinko:welcome-v1:token";
const requestKey = "tok:plinko:welcome-v1:request";
const claimRequestKey = "tok:plinko:welcome-v1:claim-request";
const shownDayKey = "tok:plinko:welcome-v1:shown-day";
const claimedKey = "tok:plinko:welcome-v1:claimed";

const lostPlay = {
  ok: true,
  enabled: true,
  available: false,
  play: {
    id: "play-1",
    requestId: "request-1",
    outcome: "lost",
    createdAt: "2026-10-28T12:00:00.000Z",
  },
  reward: null,
};

const wonPlay = {
  ...lostPlay,
  play: { ...lostPlay.play, outcome: "half_price", rewardId: "reward-1" },
  reward: {
    id: "reward-1",
    outcome: "half_price",
    label: "Une addition à moitié prix",
    status: "pending_email",
  },
};

function renderPlinko(enabled = true) {
  return render(<MemoryRouter><WelcomePlinko enabled={enabled} /></MemoryRouter>);
}

async function advance(milliseconds: number) {
  // Commit a resolved play response before advancing its requestAnimationFrame loop.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

async function openPlinko() {
  renderPlinko();
  await advance(5000);
  expect(screen.getByRole("dialog", { name: /le plinko du chef/i })).toBeInTheDocument();
}

describe("WelcomePlinko anonymous visitor flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T13:00:00+01:00"));
    sessionStorage.clear();
    localStorage.clear();
    plinkoMocks.auth = { user: null, role: null, roles: [], loading: false, rolesResolved: true };
    plinkoMocks.location = { pathname: "/", search: "", hash: "", state: null, key: "home" };
    plinkoMocks.navigate.mockReset();
    plinkoMocks.reducedMotion = false;
    plinkoMocks.startPlinkoSession.mockReset().mockResolvedValue(availableSession);
    plinkoMocks.getPlinkoStatus.mockReset().mockResolvedValue(availableSession);
    plinkoMocks.playPlinko.mockReset().mockResolvedValue(lostPlay);
    plinkoMocks.claimPlinko.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens after five seconds and only draws after an explicit play", async () => {
    renderPlinko();

    await advance(4999);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();

    await advance(1);
    expect(screen.getByRole("dialog", { name: /le plinko du chef/i })).toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /lâcher mon miamz/i })).toBeEnabled();
    expect(plinkoMocks.playPlinko).not.toHaveBeenCalled();
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
  });

  it("waits for an existing dialog to close before opening", async () => {
    const view = render(<MemoryRouter><div><div role="dialog" aria-label="Autre fenêtre" /></div><WelcomePlinko /></MemoryRouter>);

    await advance(5000);
    expect(screen.queryByRole("dialog", { name: /le plinko du chef/i })).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();

    view.rerender(<MemoryRouter><div /><WelcomePlinko /></MemoryRouter>);
    await advance(500);
    expect(screen.getByRole("dialog", { name: /le plinko du chef/i })).toBeInTheDocument();
  });

  it("recovers an expired saved session and clears its stale request identifiers", async () => {
    localStorage.setItem(tokenKey, "expired-session");
    localStorage.setItem(requestKey, "expired-draw-request");
    localStorage.setItem(claimRequestKey, "expired-claim-request");
    plinkoMocks.getPlinkoStatus.mockRejectedValueOnce(new PlinkoSessionExpiredError("Cette partie a expiré."));

    await openPlinko();

    expect(plinkoMocks.getPlinkoStatus).toHaveBeenCalledExactlyOnceWith("expired-session");
    expect(plinkoMocks.startPlinkoSession).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(tokenKey)).toBe("anonymous-plinko-session");
    expect(localStorage.getItem(requestKey)).toBeNull();
    expect(localStorage.getItem(claimRequestKey)).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lâcher mon miamz/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(6000);

    expect(plinkoMocks.playPlinko).toHaveBeenCalledWith("anonymous-plinko-session", expect.any(String));
    expect(plinkoMocks.playPlinko.mock.calls[0][1]).not.toBe("expired-draw-request");
  });

  it("retains a saved session after a network failure and retries its existing prize", async () => {
    localStorage.setItem(tokenKey, "saved-winning-session");
    localStorage.setItem(requestKey, "saved-draw-request");
    localStorage.setItem(claimRequestKey, "saved-claim-request");
    plinkoMocks.getPlinkoStatus.mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(wonPlay);

    await openPlinko();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(tokenKey)).toBe("saved-winning-session");
    expect(localStorage.getItem(requestKey)).toBe("saved-draw-request");
    expect(localStorage.getItem(claimRequestKey)).toBe("saved-claim-request");

    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    await advance(0);

    expect(plinkoMocks.getPlinkoStatus.mock.calls).toEqual([["saved-winning-session"], ["saved-winning-session"]]);
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
    expect(plinkoMocks.playPlinko).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("−50 % sur un repas");
    expect(screen.getByRole("textbox", { name: /e-?mail/i })).toBeInTheDocument();
  });

  it.each([
    { status: "fulfilled", message: /votre gain a été remis/i },
    { status: "cancelled", message: /demande a été clôturée/i },
  ])("displays a $status reward without requesting another email or draw", async ({ status, message }) => {
    localStorage.setItem(tokenKey, "saved-winning-session");
    plinkoMocks.getPlinkoStatus.mockResolvedValueOnce({
      ...wonPlay,
      reward: { ...wonPlay.reward, status },
    });

    await openPlinko();

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recevoir mon gain|lâcher mon miamz/i })).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
    expect(plinkoMocks.playPlinko).not.toHaveBeenCalled();
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();
  });

  it("does not reopen a dismissed dialog when the route rerenders", async () => {
    const view = renderPlinko();
    await advance(5000);
    fireEvent.click(screen.getByRole("button", { name: /^fermer$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    plinkoMocks.location = { ...plinkoMocks.location, pathname: "/recherche", key: "search" };
    view.rerender(<MemoryRouter><WelcomePlinko /></MemoryRouter>);
    await advance(10000);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /ouvrir le plinko tok/i })).not.toBeInTheDocument();
  });

  it.each(["/auth", "/panier", "/commande/confirmation"])("suppresses the popup on %s", async (pathname) => {
    plinkoMocks.location = { ...plinkoMocks.location, pathname };
    renderPlinko();
    await advance(10000);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
    expect(plinkoMocks.playPlinko).not.toHaveBeenCalled();
  });

  it("does not show the visitor game to a signed-in customer", async () => {
    plinkoMocks.auth = { user: { id: "customer-1" }, role: "client", roles: ["client"], loading: false, rolesResolved: true };
    renderPlinko();
    await advance(10000);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ouvrir le plinko tok/i })).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
  });

  it("does not open while auth is unresolved or when disabled", async () => {
    plinkoMocks.auth.loading = true;
    const view = renderPlinko();
    await advance(10000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();

    plinkoMocks.auth.loading = false;
    view.rerender(<MemoryRouter><WelcomePlinko enabled={false} /></MemoryRouter>);
    await advance(10000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).not.toHaveBeenCalled();
  });

  it("submits a single anonymous draw even when play is clicked twice", async () => {
    let resolvePlay!: (value: typeof lostPlay) => void;
    plinkoMocks.playPlinko.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    await openPlinko();

    const playButton = screen.getByRole("button", { name: /lâcher mon miamz/i });
    fireEvent.click(playButton);
    fireEvent.click(playButton);

    expect(plinkoMocks.playPlinko).toHaveBeenCalledTimes(1);
    expect(plinkoMocks.playPlinko).toHaveBeenCalledWith("anonymous-plinko-session", expect.any(String));
    expect(plinkoMocks.navigate).not.toHaveBeenCalled();
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();

    await act(async () => { resolvePlay(lostPlay); });
    await advance(6000);
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
  });

  it("reuses the request identifier after a network error", async () => {
    plinkoMocks.playPlinko.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(lostPlay);
    await openPlinko();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(6000);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz|réessayer/i }));
    await advance(6000);

    expect(plinkoMocks.playPlinko).toHaveBeenCalledTimes(2);
    expect(plinkoMocks.playPlinko.mock.calls[0]).toEqual(plinkoMocks.playPlinko.mock.calls[1]);
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();
  });

  it("asks a winner for an email after the draw and keeps marketing consent optional", async () => {
    plinkoMocks.playPlinko.mockResolvedValueOnce(wonPlay);
    plinkoMocks.claimPlinko.mockResolvedValueOnce({
      ...wonPlay,
      reward: { ...wonPlay.reward, status: "pending_fulfillment" },
    });
    await openPlinko();
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(500);
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("−50 % sur un repas");
    await advance(5500);

    expect(screen.getByRole("status")).toHaveTextContent("−50 % sur un repas");
    const email = screen.getByRole("textbox", { name: /e-?mail/i });
    expect(email).toHaveAttribute("type", "email");
    const marketingConsent = screen.getByRole("checkbox");
    expect(marketingConsent).not.toBeChecked();
    expect(marketingConsent).not.toBeRequired();
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "chef@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /recevoir mon gain/i }));
    await advance(0);

    expect(plinkoMocks.claimPlinko).toHaveBeenCalledTimes(1);
    expect(plinkoMocks.claimPlinko).toHaveBeenCalledWith(
      "anonymous-plinko-session", expect.any(String), "chef@example.com", false,
    );
    expect(plinkoMocks.navigate).not.toHaveBeenCalled();
  });

  it("does not announce a win when the server returns a winning draw without its reward", async () => {
    plinkoMocks.playPlinko.mockResolvedValueOnce({ ...wonPlay, reward: null });
    await openPlinko();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(6000);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("−50 % sur un repas");
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
    expect(plinkoMocks.claimPlinko).not.toHaveBeenCalled();
  });

  it("recovers an unclaimed win on the following day without issuing another draw", async () => {
    let resolvePlay!: (value: typeof wonPlay) => void;
    plinkoMocks.playPlinko.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    const firstVisit = renderPlinko();
    await advance(5000);
    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    fireEvent.click(screen.getByRole("button", { name: /^fermer$/i }));

    await act(async () => { resolvePlay(wonPlay); });
    await advance(6000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    firstVisit.unmount();

    // A reload in the same browser on the same day must stay silent.
    const sameDay = renderPlinko();
    await advance(5000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    sameDay.unmount();

    vi.setSystemTime(new Date("2026-10-30T13:00:00+01:00"));
    plinkoMocks.getPlinkoStatus.mockResolvedValueOnce(wonPlay);
    renderPlinko();
    await advance(5000);

    expect(screen.getByRole("dialog", { name: /le plinko du chef/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("−50 % sur un repas");
    expect(screen.getByRole("textbox", { name: /e-?mail/i })).toBeInTheDocument();
    expect(localStorage.getItem(shownDayKey)).toBe("2026-10-30");
    expect(plinkoMocks.playPlinko).toHaveBeenCalledTimes(1);
    expect(plinkoMocks.startPlinkoSession).toHaveBeenCalledTimes(1);
    expect(plinkoMocks.getPlinkoStatus).toHaveBeenCalledExactlyOnceWith("anonymous-plinko-session");
  });

  it("reveals the server result without an animation delay when reduced motion is requested", async () => {
    plinkoMocks.reducedMotion = true;
    plinkoMocks.playPlinko.mockResolvedValueOnce(wonPlay);
    await openPlinko();

    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(0);

    expect(screen.getByRole("status")).toHaveTextContent("−50 % sur un repas");
    expect(screen.getByRole("textbox", { name: /e-?mail/i })).toBeInTheDocument();
  });

  it("allows exactly one new physical drop after a replay and reveals the next server result", async () => {
    plinkoMocks.playPlinko.mockResolvedValueOnce({
      ...lostPlay, available: true, play: { ...lostPlay.play, outcome: "replay" },
    }).mockResolvedValueOnce(wonPlay);
    await openPlinko();
    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(6000);
    fireEvent.click(screen.getByRole("button", { name: /rejouer mon coup gratuit/i }));
    await advance(500);
    expect(document.querySelector(".tok-plinko__pockets .is-selected")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
    await advance(5500);
    expect(screen.getByRole("textbox", { name: /e-?mail/i })).toBeInTheDocument();
    expect(plinkoMocks.playPlinko).toHaveBeenCalledTimes(2);
    expect(plinkoMocks.playPlinko.mock.calls[0][1]).not.toBe(plinkoMocks.playPlinko.mock.calls[1][1]);
  });

  it("recovers an interrupted animation the next day without double-spending", async () => {
    plinkoMocks.playPlinko.mockResolvedValueOnce(wonPlay);
    const firstVisit = renderPlinko();
    await advance(5000);
    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: /^fermer$/i }));
    firstVisit.unmount();

    vi.setSystemTime(new Date("2026-10-30T13:00:00+01:00"));
    plinkoMocks.getPlinkoStatus.mockResolvedValueOnce(wonPlay);
    renderPlinko();
    await advance(5000);
    expect(screen.getByRole("status")).toHaveTextContent("−50 % sur un repas");
    expect(screen.getByRole("textbox", { name: /e-?mail/i })).toBeInTheDocument();
    expect(plinkoMocks.playPlinko).toHaveBeenCalledTimes(1);
  });

  it("does not reopen tomorrow after the winner submits an email", async () => {
    plinkoMocks.reducedMotion = true;
    plinkoMocks.playPlinko.mockResolvedValueOnce(wonPlay);
    plinkoMocks.claimPlinko.mockResolvedValueOnce({
      ...wonPlay,
      reward: { ...wonPlay.reward, status: "pending_fulfillment" },
    });
    const firstVisit = renderPlinko();
    await advance(5000);
    fireEvent.click(screen.getByRole("button", { name: /lâcher mon miamz/i }));
    await advance(0);
    fireEvent.change(screen.getByRole("textbox", { name: /e-?mail/i }), { target: { value: "personne@example.ch" } });
    fireEvent.click(screen.getByRole("button", { name: /recevoir mon gain/i }));
    await advance(0);
    expect(localStorage.getItem(claimedKey)).toBe("1");
    firstVisit.unmount();

    vi.setSystemTime(new Date("2026-10-30T13:00:00+01:00"));
    renderPlinko();
    await advance(10000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(plinkoMocks.startPlinkoSession).toHaveBeenCalledTimes(1);
    expect(plinkoMocks.getPlinkoStatus).not.toHaveBeenCalled();
  });


});
