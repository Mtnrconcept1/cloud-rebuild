import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("public/tok-slot-machine/index.html", "utf8");
const script = readFileSync("public/tok-slot-machine/slot-machine.js", "utf8");
const openFrames: JSDOM[] = [];

function frame(reducedMotion = true) {
  const dom = new JSDOM(html, { url: "https://tok.test/tok-slot-machine/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  openFrames.push(dom);
  const { window } = dom;
  const parent = { postMessage: vi.fn() };
  Object.defineProperty(window, "parent", { value: parent });
  window.matchMedia = vi.fn(() => ({ matches: reducedMotion })) as unknown as typeof window.matchMedia;
  window.eval(script);
  const button = window.document.getElementById("spinButton") as HTMLButtonElement;
  const text = (id: string) => window.document.getElementById(id)!.textContent;
  const send = (data: Record<string, unknown>, origin = window.location.origin, source: unknown = parent) => {
    window.dispatchEvent(new window.MessageEvent("message", { data, origin, source }));
  };
  const status = (remaining: number, total = 0, extra: Record<string, unknown> = {}) => send({
    type: "TOK_SLOT_SET_STATUS", enabled: remaining > 0, attemptsRemaining: remaining, maxAttempts: 3, sessionRewardPoints: total, ...extra,
  });
  const result = async (id: string, points: number, remaining: number, total: number) => {
    send({ type: "TOK_SLOT_SPIN_RESULT", requestId: id, symbols: ["logo", "chef", "miamz"], rewardPoints: points,
      totalPoints: 1_000 + total, attemptsRemaining: remaining, maxAttempts: 3, sessionRewardPoints: total });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  const calls = (type: string) => parent.postMessage.mock.calls.filter(([data]) => data.type === type);
  return { window, button, text, send, status, result, calls };
}

afterEach(() => { for (const dom of openFrames.splice(0)) dom.window.close(); });

describe("hosted daily slot game", () => {
  it("starts locked, trusts only its same-origin parent, and sends one request per click sequence", () => {
    const game = frame();
    expect(game.button.disabled).toBe(true);
    expect(game.calls("TOK_SLOT_FRAME_READY")).toHaveLength(1);
    const status = { type: "TOK_SLOT_SET_STATUS", enabled: true, attemptsRemaining: 3, maxAttempts: 3 };
    game.send(status, "https://foreign.test");
    game.send(status, "https://tok.test", game.window);
    expect(game.button.disabled).toBe(true);
    game.status(3);
    game.button.click();
    game.button.click();
    expect(game.calls("TOK_SLOT_SPIN_REQUEST")).toHaveLength(1);
    expect(game.button.disabled).toBe(true);
  });

  it("shows the three committed results, their cumulative gains and the final locked summary", async () => {
    const game = frame();
    game.status(3);
    game.button.click();
    await game.result("one", 4, 2, 4);
    expect(game.text("sessionWin")).toBe("4");
    expect(game.button.textContent).toContain("2");
    game.button.click();
    await game.result("two", 12, 1, 16);
    expect(game.text("sessionWin")).toBe("16");
    game.button.click();
    await game.result("three", 3, 0, 19);
    expect(game.text("sessionWin")).toBe("19");
    expect(game.text("message")).toContain("19 Miamz");
    expect(game.text("message")).not.toContain("1019");
    expect(game.button.disabled).toBe(true);
    expect(game.text("subMessage")).toContain("se ferme");
    expect(game.window.document.querySelectorAll(".round.is-complete")).toHaveLength(3);
    game.button.click();
    await game.result("three", 3, 0, 19);
    expect(game.calls("TOK_SLOT_SPIN_REQUEST")).toHaveLength(3);
    expect(game.calls("TOK_SLOT_ANIMATION_COMPLETE")).toHaveLength(3);
  });

  it("preserves the earned total while showing a retryable network error", async () => {
    const game = frame();
    game.status(3);
    game.button.click();
    await game.result("one", 4, 2, 4);
    game.button.click();
    game.status(2, 4, { message: "Tirage interrompu", subMessage: "Réessayez sans perdre de tentative." });
    expect(game.button.disabled).toBe(false);
    expect(game.text("sessionWin")).toBe("4");
    expect(game.text("subMessage")).toContain("Réessayez");
    game.button.click();
    expect(game.calls("TOK_SLOT_SPIN_REQUEST")).toHaveLength(3);
  });

  it("waits for every reel animation before reporting completion", async () => {
    const game = frame(false);
    const finish: Array<() => void> = [];
    const animate = vi.fn(() => ({ finished: new Promise<void>((resolve) => finish.push(resolve)), cancel: vi.fn() }));
    game.window.Element.prototype.animate = animate;
    game.status(3);
    game.button.click();
    await game.result("animated", 4, 2, 4);
    expect(animate).toHaveBeenCalledTimes(3);
    expect(game.calls("TOK_SLOT_ANIMATION_COMPLETE")).toHaveLength(0);
    finish[0](); finish[1]();
    await Promise.resolve();
    expect(game.button.disabled).toBe(true);
    finish[2]();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(game.calls("TOK_SLOT_ANIMATION_COMPLETE")).toHaveLength(1);
    expect(game.button.disabled).toBe(false);
  });

  it("skips reel animations for reduced motion", async () => {
    const game = frame();
    const animate = vi.fn();
    game.window.Element.prototype.animate = animate;
    game.status(3);
    game.button.click();
    await game.result("reduced", 4, 2, 4);
    expect(animate).not.toHaveBeenCalled();
    expect(game.calls("TOK_SLOT_ANIMATION_COMPLETE")).toHaveLength(1);
  });
});
