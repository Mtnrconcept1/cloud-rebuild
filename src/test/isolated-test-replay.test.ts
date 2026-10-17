import { describe, expect, it } from "vitest";
import { assertReplayDisabled } from "../../scripts/configure-isolated-test-backend.mjs";
describe("isolated branch replay remains blocked", () => {
  it("stops before credentials or any SQL call", () => {
    expect(() => assertReplayDisabled("replay")).toThrow("TEST_MIGRATION_REPLAY_BLOCKED_NO_PROVEN_OUTBOUND_QUARANTINE");
  });
  it("allows only the separate preflight/configuration paths past this guard", () => {
    expect(() => assertReplayDisabled("preflight")).not.toThrow();
    expect(() => assertReplayDisabled("configure")).not.toThrow();
  });
});
