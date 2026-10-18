import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runImageGenerationIntention } from "@/lib/ai/imageGenerationIntention";

const request = { restaurantId: "synthetic-restaurant", prompt: "synthetic prompt", format: "square", references: ["a", "b"] };
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => vi.unstubAllGlobals());

describe("image generation intentions", () => {
  it("joins simultaneous requests before the first asynchronous digest", async () => {
    const send = vi.fn(async (key: string) => ({ key }));
    const first = runImageGenerationIntention("user-a", request, send);
    const second = runImageGenerationIntention("user-a", { ...request }, send);
    expect(first).toBe(second);
    expect(await first).toEqual(await second);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains exactly the same key after an uncertain result, including a module reload", async () => {
    let firstKey = "";
    await expect(runImageGenerationIntention("user-a", request, async (key) => { firstKey = key; throw new Error("network_timeout"); })).rejects.toThrow("network_timeout");
    vi.resetModules();
    const { runImageGenerationIntention: reloaded } = await import("@/lib/ai/imageGenerationIntention");
    const result = await reloaded("user-a", request, async (key) => key);
    expect(result).toBe(firstKey);
    expect(sessionStorage.length).toBe(0);
  });
  it("does not share keys between users or different payloads", async () => {
    const keys: string[] = [];
    for (const [user, body] of [["user-a", request], ["user-b", request], ["user-a", { ...request, prompt: "changed" }]] as const) {
      await expect(runImageGenerationIntention(user, body, async (key) => { keys.push(key); throw new Error("image_operation_pending"); })).rejects.toThrow();
    }
    expect(new Set(keys).size).toBe(3);
  });
  it("canonicalizes object keys and starts a new intention after confirmed success", async () => {
    let original = "";
    await expect(runImageGenerationIntention("user-a", { b: 2, a: 1 }, async (key) => { original = key; throw new Error("timeout"); })).rejects.toThrow();
    expect(await runImageGenerationIntention("user-a", { a: 1, b: 2 }, async (key) => key)).toBe(original);
    expect(await runImageGenerationIntention("user-a", { a: 1, b: 2 }, async (key) => key)).not.toBe(original);
  });
  it("releases a key only after explicit terminal failure", async () => {
    let first = "";
    await expect(runImageGenerationIntention("user-a", request, async (key) => { first = key; throw new Error("image_generation_failed"); })).rejects.toThrow();
    expect(await runImageGenerationIntention("user-a", request, async (key) => key)).not.toBe(first);
  });
  it("fails before sending if persistence is unavailable or the explicit key is malformed", async () => {
    const send = vi.fn();
    vi.stubGlobal("sessionStorage", { getItem() { throw new Error("blocked"); } });
    await expect(runImageGenerationIntention("user-a", request, send)).rejects.toThrow("image_intention_storage_unavailable");
    await expect(runImageGenerationIntention("user-a", request, send, "bad")).rejects.toThrow("image_idempotency_key_invalid");
    expect(send).not.toHaveBeenCalled();
  });
  it("preserves an explicit key supplied by a caller across attempts", async () => {
    const key = "intent:explicit-123";
    expect(await runImageGenerationIntention("user-a", request, async (value) => value, key)).toBe(key);
    expect(await runImageGenerationIntention("user-a", request, async (value) => value, key)).toBe(key);
  });
});
