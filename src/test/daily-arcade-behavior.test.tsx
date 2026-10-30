import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DailyTokArcade from "@/components/DailyTokArcade";

const mocks = vi.hoisted(() => ({
  auth: { user: { id: "client-a" } as { id: string } | null, role: "client", roles: ["client"], loading: false },
  fetch: vi.fn(),
  wallet: { setQueriesData: vi.fn(), invalidateQueries: vi.fn() },
  success: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/env", () => ({ SUPABASE_URL: "https://tok.example.supabase.co" }));
vi.mock("@/lib/session", () => ({ fetchWithFreshAccessToken: (...args: unknown[]) => mocks.fetch(...args) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks.wallet }));
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args) } }));
vi.mock("@/components/DailyMiamzSlotMachine", () => ({
  default: () => <div data-testid="secure-slot">TOK slot</div>,
}));
vi.mock("@/components/plinko/PlinkoBoard", () => ({
  default: () => <div data-testid="daily-plinko-board">Plinko 1 3 5 7 10</div>,
}));
vi.mock("@/lib/plinko-physics", () => ({
  PLINKO_POCKETS: ["free_meal", "replay", "tok_one_month", "lost", "half_price"],
  createPlinkoTrajectory: () => { throw new Error("No animation in test environment"); },
}));

const respond = (value: Record<string, unknown>) => ({ ok: true, json: async () => value }) as Response;
const status = (game: string, remaining = 3, total = 0, playDate = "2026-10-29") =>
  respond({ ok: true, game, playDate, maxAttempts: 3, attemptsUsed: 3 - remaining, attemptsRemaining: remaining,
    sessionRewardPoints: total, available: remaining > 0 });

const result = (game: string, reward: number, remaining: number, total: number) =>
  respond({ ok: true, game, playDate: "2026-10-29", maxAttempts: 3, attemptsRemaining: remaining,
    sessionRewardPoints: total, totalLoyaltyPoints: 1000 + total,
    play: { id: "arcade-" + remaining, requestId: "request-" + remaining, rewardPoints: reward,
      attemptNumber: 3 - remaining, toyType: game === "claw" ? "basil" : null } });

const posts = () => mocks.fetch.mock.calls.filter(([, options]) => options?.method === "POST");

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mocks.auth = { user: { id: "client-a" }, role: "client", roles: ["client"], loading: false };
  mocks.fetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("daily TOK mini-game selection", () => {
  it("does not mount a game for users without an eligible client role", async () => {
    mocks.auth.role = "admin";
    mocks.auth.roles = ["client", "admin"];
    render(<DailyTokArcade />);
    await flush();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows only the assigned slot and never a second mini-game", async () => {
    mocks.fetch.mockResolvedValueOnce(status("slot"));
    render(<DailyTokArcade />);
    await flush();
    expect(screen.getByTestId("secure-slot")).toBeInTheDocument();
    expect(screen.queryByTitle("TOK Miamz — attrape-figurines")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("shows no game when the daily 3 attempts were exhausted", async () => {
    mocks.fetch.mockResolvedValueOnce(status("claw", 0, 16));
    render(<DailyTokArcade />);
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["slot", "plinko", "claw"])("never reopens %s once the user has played today", async (game) => {
    mocks.fetch.mockResolvedValueOnce(status(game, 2, 7));
    render(<DailyTokArcade />);
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("secure-slot")).not.toBeInTheDocument();
    expect(screen.queryByTestId("daily-plinko-board")).not.toBeInTheDocument();
    expect(screen.queryByTitle("TOK Miamz — attrape-figurines")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("does not offer any game to a visitor without an authenticated account", async () => {
    mocks.auth.user = null;
    render(<DailyTokArcade />);
    await flush();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows a fresh game on the following Swiss calendar day", async () => {
    mocks.fetch.mockResolvedValueOnce(status("claw", 2, 7, "2026-10-29"));
    const first = render(<DailyTokArcade />);
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    first.unmount();

    mocks.fetch.mockResolvedValueOnce(status("plinko", 3, 0, "2026-10-30"));
    render(<DailyTokArcade />);
    await flush();
    expect(screen.getByTestId("daily-plinko-board")).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("awards the three Plinko results and automatically closes after showing the total", async () => {
    mocks.fetch.mockResolvedValueOnce(status("plinko"));
    render(<DailyTokArcade />);
    await flush();
    expect(screen.getByTestId("daily-plinko-board")).toBeInTheDocument();
    for (const [i, reward] of [1, 3, 5].entries()) {
      mocks.fetch.mockResolvedValueOnce(result("plinko", reward, 2 - i, [1, 4, 9][i]));
      fireEvent.click(screen.getByRole("button", { name: "Lancer un Miamz" }));
      await flush();
    }
    expect(posts()).toHaveLength(3);
    expect(screen.getByText("Miamz remportés")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success.mock.calls[0][0]).toContain("9 Miamz");
  });

  it("ignores forged claw messages and credits only a trusted iframe result", async () => {
    mocks.fetch.mockResolvedValueOnce(status("claw"));
    render(<DailyTokArcade />);
    await flush();
    const frame = screen.getByTitle("TOK Miamz — attrape-figurines") as HTMLIFrameElement;
    const data = { type: "TOK_CLAW_RESULT", captured: true, attemptNumber: 1, toyType: "basil" };
    act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin: "https://attacker.test", source: frame.contentWindow })); });
    expect(posts()).toHaveLength(0);
    mocks.fetch.mockResolvedValueOnce(result("claw", 7, 2, 7));
    act(() => { window.dispatchEvent(new MessageEvent("message", {
      data, origin: "https://tok-miamz-claw-arcade.vercel.app", source: frame.contentWindow,
    })); });
    await flush();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body as string)).toEqual({ game: "claw", captured: true, toyType: "basil" });
    expect(posts()[0][1].headers["Idempotency-Key"]).toBeTruthy();
    expect(mocks.wallet.setQueriesData).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new MessageEvent("message", {
      data, origin: "https://tok-miamz-claw-arcade.vercel.app", source: frame.contentWindow,
    })); });
    expect(posts()).toHaveLength(1);
  });
});
