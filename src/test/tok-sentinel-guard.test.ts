import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertSentinelAllowed } from "../../supabase/functions/_shared/tok-sentinel-guard.ts";
import type { RequestActor } from "../../supabase/functions/_shared/auth.ts";

const config = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  getEnv: (name: string) => name === "TOK_SENTINEL_ENFORCEMENT_ENABLED" && config.enabled ? "true" : "",
  HttpError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

function actorWithResult(result: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  const actor = {
    userId: "a1111111-1111-4111-8111-111111111111",
    adminClient: { rpc },
  } as unknown as RequestActor;
  return { actor, rpc };
}

beforeEach(() => { config.enabled = false; });

describe("TOK Sentinel privileged-operation guard", () => {
  it("does not alter transactions before the explicitly reviewed rollout", async () => {
    const { actor, rpc } = actorWithResult(false);
    await expect(assertSentinelAllowed(actor, "payments")).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("denies new financial operations under a containment", async () => {
    config.enabled = true;
    const { actor, rpc } = actorWithResult(false);
    await expect(assertSentinelAllowed(actor, "payments")).rejects.toMatchObject({
      status: 423, message: "SENTINEL_OPERATION_TEMPORARILY_LOCKED",
    });
    expect(rpc).toHaveBeenCalledWith("tok_sentinel_write_allowed", {
      p_operation: "payments",
      p_restaurant_id: null,
      p_user_id: "a1111111-1111-4111-8111-111111111111",
    });
  });

  it("fails closed on an unavailable or malformed authoritative DB decision", async () => {
    config.enabled = true;
    for (const [result, error] of [[null, { message: "db_down" }], ["true", null]] as const) {
      const { actor } = actorWithResult(result, error);
      await expect(assertSentinelAllowed(actor, "operations")).rejects.toMatchObject({
        status: 503, message: "SENTINEL_SECURITY_CHECK_UNAVAILABLE",
      });
    }
  });

  it("permits a verified operation and binds the exact verified restaurant scope", async () => {
    config.enabled = true;
    const { actor, rpc } = actorWithResult(true);
    const target = "b2222222-2222-4222-8222-222222222222";
    await assertSentinelAllowed(actor, "payments", target);
    expect(rpc).toHaveBeenCalledWith("tok_sentinel_write_allowed", {
      p_operation: "payments", p_restaurant_id: target,
      p_user_id: "a1111111-1111-4111-8111-111111111111",
    });
  });

  it("never forwards a malformed restaurant identifier to privileged SQL", async () => {
    config.enabled = true;
    const { actor, rpc } = actorWithResult(true);
    await assertSentinelAllowed(actor, "operations", "evil' OR true --");
    expect(rpc).toHaveBeenCalledWith("tok_sentinel_write_allowed", {
      p_operation: "operations", p_restaurant_id: null,
      p_user_id: "a1111111-1111-4111-8111-111111111111",
    });
  });
});
