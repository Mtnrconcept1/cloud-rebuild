import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DailyMiamzSlotMachine from "@/components/DailyMiamzSlotMachine";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: "client-1" } as { id: string } | null,
    role: "client",
    roles: ["client"],
    loading: false,
  },
  fetch: vi.fn(),
  queryClient: { setQueriesData: vi.fn(), invalidateQueries: vi.fn() },
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/session", () => ({ fetchWithFreshAccessToken: (...args: unknown[]) => mocks.fetch(...args) }));
vi.mock("@/lib/env", () => ({ SUPABASE_URL: "https://tok.test.supabase.co" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock("sonner", () => ({ toast: {
  success: (...args: unknown[]) => mocks.success(...args),
  info: (...args: unknown[]) => mocks.info(...args),
} }));

const respond = (payload: Record<string, unknown>) => ({ ok: true, json: async () => payload }) as Response;
const status = (attemptsRemaining = 3) => respond({ available: attemptsRemaining > 0, attemptsRemaining, maxAttempts: 3 });
const result = (rewardPoints: number, attemptsRemaining: number, extra: Record<string, unknown> = {}) => respond({
  spin: { id: `spin-${3 - attemptsRemaining}`, symbols: ["logo", "chef", "miamz"], rewardPoints, attemptNumber: 3 - attemptsRemaining },
  attemptsRemaining,
  maxAttempts: 3,
  totalLoyaltyPoints: 1_000 + rewardPoints,
  ...extra,
});

async function flushResponses() {
  await act(async () => { await Promise.resolve(); });
}

function postFrame(frame: HTMLIFrameElement, data: Record<string, unknown>, origin = window.location.origin, source: Window | null = frame.contentWindow) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
  });
}

async function openMachine(attemptsRemaining = 3) {
  mocks.fetch.mockResolvedValueOnce(status(attemptsRemaining));
  const view = render(<DailyMiamzSlotMachine />);
  await flushResponses();
  const frame = screen.getByTitle("Machine à sous TOK") as HTMLIFrameElement;
  const sent = vi.spyOn(frame.contentWindow!, "postMessage");
  postFrame(frame, { type: "TOK_SLOT_FRAME_READY" });
  return { ...view, frame, sent };
}

async function spin(frame: HTMLIFrameElement, sent: ReturnType<typeof vi.spyOn>) {
  postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
  await flushResponses();
  const results = sent.mock.calls.map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === "TOK_SLOT_SPIN_RESULT");
  expect(results.length).toBeGreaterThan(0);
  return results.at(-1)!;
}

function complete(frame: HTMLIFrameElement, spinResult: Record<string, unknown>) {
  postFrame(frame, { type: "TOK_SLOT_ANIMATION_COMPLETE", requestId: spinResult.requestId });
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

const posts = () => mocks.fetch.mock.calls.filter(([, options]) => options?.method === "POST");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  mocks.fetch.mockReset();
  mocks.auth.user = { id: "client-1" };
  mocks.auth.role = "client";
  mocks.auth.roles = ["client"];
  mocks.auth.loading = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("daily Miamz slot machine lifecycle", () => {
  it("waits for all three animated results, then closes with the sum of gains rather than the wallet balance", async () => {
    const { frame, sent } = await openMachine();
    expect(screen.queryByRole("textbox", { name: /e-?mail/i })).not.toBeInTheDocument();
    mocks.fetch.mockResolvedValueOnce(result(4, 2));
    const first = await spin(frame, sent);
    expect(first.sessionRewardPoints).toBe(4);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fermeture indisponible/i })).toBeDisabled();
    complete(frame, first);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    mocks.fetch.mockResolvedValueOnce(result(12, 1));
    const second = await spin(frame, sent);
    expect(second.sessionRewardPoints).toBe(16);
    complete(frame, second);
    expect(mocks.success).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValueOnce(result(3, 0, { totalLoyaltyPoints: 1_019 }));
    const third = await spin(frame, sent);
    expect(third.sessionRewardPoints).toBe(19);
    await advance(1_800);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();

    complete(frame, second);
    postFrame(frame, { type: "TOK_SLOT_ANIMATION_COMPLETE" });
    await advance(1_800);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    complete(frame, third);
    complete(frame, third);
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    await advance(1_799);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await advance(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(3);
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success.mock.calls[0][0]).toContain("19 Miamz");
    expect(mocks.success.mock.calls[0][0]).not.toContain("1019");
    expect(mocks.queryClient.setQueriesData).toHaveBeenCalledTimes(3);
    expect(mocks.queryClient.setQueriesData).toHaveBeenLastCalledWith(
      { queryKey: ["profile-loyalty", "client-1"] }, expect.any(Function),
    );
  });

  it("unlocks the frame after an interrupted intermediate animation without consuming another turn", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { frame, sent } = await openMachine();
    mocks.fetch.mockResolvedValueOnce(result(4, 2));
    await spin(frame, sent);
    await advance(6_500);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const lastStatus = sent.mock.calls.map(([message]) => message as Record<string, unknown>)
      .filter((message) => message.type === "TOK_SLOT_SET_STATUS").at(-1);
    expect(lastStatus).toMatchObject({ enabled: true, attemptsRemaining: 2, sessionRewardPoints: 4 });
    expect(posts()).toHaveLength(1);
    expect(mocks.success).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(result(3, 1));
    expect((await spin(frame, sent)).sessionRewardPoints).toBe(7);
  });

  it("finishes the last round if the iframe never reports animation completion", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { frame, sent } = await openMachine(1);
    mocks.fetch.mockResolvedValueOnce(result(9, 0));
    await spin(frame, sent);
    await advance(6_499);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    await advance(1 + 1_800);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success.mock.calls[0][0]).toContain("9 Miamz");
    expect(warning).toHaveBeenCalled();
  });

  it("retries an uncertain request with the same key and counts its replay only once", async () => {
    const { frame, sent } = await openMachine();
    mocks.fetch.mockRejectedValueOnce(new TypeError("Network unavailable"));
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    await flushResponses();
    expect(posts()).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    mocks.fetch.mockResolvedValueOnce(result(7, 2, { idempotentReplay: true }));
    const replay = await spin(frame, sent);
    expect(posts()[0][1].headers["Idempotency-Key"]).toBe(posts()[1][1].headers["Idempotency-Key"]);
    expect(replay.sessionRewardPoints).toBe(7);
    complete(frame, replay);

    mocks.fetch.mockResolvedValueOnce(result(3, 1));
    const next = await spin(frame, sent);
    expect(posts()[2][1].headers["Idempotency-Key"]).not.toBe(posts()[1][1].headers["Idempotency-Key"]);
    expect(next.sessionRewardPoints).toBe(10);
  });

  it("ignores messages from other origins or windows and blocks overlapping requests", async () => {
    const { frame, sent } = await openMachine();
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" }, "https://foreign.example");
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" }, window.location.origin, window);
    expect(posts()).toHaveLength(0);

    let resolvePost!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePost = resolve; }));
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    postFrame(frame, { type: "TOK_SLOT_ANIMATION_COMPLETE", requestId: posts()[0][1].headers["Idempotency-Key"] });
    expect(posts()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /fermeture indisponible/i })).toBeDisabled();

    await act(async () => { resolvePost(result(4, 2)); });
    await flushResponses();
    const received = sent.mock.calls.map(([message]) => message as Record<string, unknown>)
      .find((message) => message.type === "TOK_SLOT_SPIN_RESULT")!;
    postFrame(frame, { type: "TOK_SLOT_ANIMATION_COMPLETE", requestId: "stale-request" });
    postFrame(frame, { type: "TOK_SLOT_ANIMATION_COMPLETE" });
    expect(screen.getByRole("button", { name: /fermeture indisponible/i })).toBeDisabled();
    complete(frame, received);
    expect(screen.getByRole("button", { name: /fermer la machine TOK/i })).toBeEnabled();
  });

  it.each(["logout", "unmount"])("discards a late successful POST after %s", async (change) => {
    const { frame, rerender, unmount } = await openMachine(1);
    let resolvePost!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePost = resolve; }));
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    if (change === "logout") {
      mocks.auth.user = null;
      rerender(<DailyMiamzSlotMachine />);
    } else {
      unmount();
    }
    await act(async () => { resolvePost(result(50, 0)); });
    await advance(20_000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.queryClient.setQueriesData).not.toHaveBeenCalled();
  });

  it("cancels the pending final summary when the client logs out", async () => {
    const { frame, sent, rerender } = await openMachine(1);
    mocks.fetch.mockResolvedValueOnce(result(3, 0));
    const last = await spin(frame, sent);
    complete(frame, last);
    mocks.auth.user = null;
    rerender(<DailyMiamzSlotMachine />);
    await advance(20_000);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the final gain exactly once when the client closes during the celebration", async () => {
    const { frame, sent } = await openMachine(1);
    mocks.fetch.mockResolvedValueOnce(result(12, 0));
    const last = await spin(frame, sent);
    complete(frame, last);
    fireEvent.click(screen.getByRole("button", { name: /fermer la machine TOK/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success.mock.calls[0][0]).toContain("12 Miamz");
    await advance(20_000);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("does not count another tab's already claimed reward as a gain in this game", async () => {
    const { frame, sent } = await openMachine(1);
    mocks.fetch.mockResolvedValueOnce(result(50, 0, { alreadyClaimed: true, idempotentReplay: false }));
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    await flushResponses();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sent.mock.calls.some(([message]) => message.type === "TOK_SLOT_SPIN_RESULT")).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledTimes(1);
    await advance(20_000);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("preserves this game's earned total when another tab finishes the remaining tours", async () => {
    const { frame, sent } = await openMachine();
    mocks.fetch.mockResolvedValueOnce(result(4, 2));
    complete(frame, await spin(frame, sent));
    mocks.fetch.mockResolvedValueOnce(result(50, 0, { alreadyClaimed: true, idempotentReplay: false }));
    postFrame(frame, { type: "TOK_SLOT_SPIN_REQUEST" });
    await flushResponses();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      description: expect.stringContaining("4 Miamz"),
    }));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("never opens for a client with a privileged restaurant role", async () => {
    mocks.auth.roles = ["client", "restaurateur"];
    render(<DailyMiamzSlotMachine />);
    await flushResponses();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
