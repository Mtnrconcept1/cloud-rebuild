import test from "node:test";
import assert from "node:assert/strict";
import { CommitUncertainError, completeJob } from "./index.js";

function selectChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => chain,
    abortSignal: async () => result,
  };
  return chain;
}

const config = {
  httpRetryAttempts: 1,
  retryBaseMs: 0,
  supabaseTimeoutMs: 1000,
};

const payload = {
  p_image_id: "44444444-4444-4444-8444-444444444444",
  p_ai_metadata: { input_sha256: "abc123" },
};

test("accepts exactly one valid atomic completion receipt", async () => {
  const supabase = {
    rpc: () => ({ abortSignal: async () => ({
      data: [{
        completed_image_id: payload.p_image_id,
        completed_media_id: "66666666-6666-4666-8666-666666666666",
        completion_status: "completed",
      }],
      error: null,
    }) }),
    from: () => { throw new Error("verification should not run after a valid receipt"); },
  };
  await assert.doesNotReject(() => completeJob(supabase, payload, config));
});

test("treats a matching completed row as success after an uncertain RPC response", async () => {
  const supabase = {
    rpc: () => ({ abortSignal: async () => { throw new TypeError("fetch failed"); } }),
    from: () => selectChain({
      data: { analysis_status: "completed", ai_metadata: { input_sha256: "abc123" } },
      error: null,
    }),
  };
  await assert.doesNotReject(() => completeJob(supabase, payload, config));
});

test("keeps an uncertain commit leased instead of incorrectly marking it failed", async () => {
  const supabase = {
    rpc: () => ({ abortSignal: async () => { throw new TypeError("fetch failed"); } }),
    from: () => selectChain({
      data: { analysis_status: "processing", ai_metadata: {} },
      error: null,
    }),
  };
  await assert.rejects(() => completeJob(supabase, payload, config), CommitUncertainError);
});

test("surfaces a definitive RPC rejection so the job can be requeued safely", async () => {
  const supabase = {
    rpc: () => ({ abortSignal: async () => ({ data: null, error: { message: "invalid payload", code: "22023" } }) }),
    from: () => selectChain({ data: { analysis_status: "processing", ai_metadata: {} }, error: null }),
  };
  await assert.rejects(
    () => completeJob(supabase, payload, config),
    (error) => error.name === "RpcRejectedError" && /invalid payload/.test(error.message),
  );
});
