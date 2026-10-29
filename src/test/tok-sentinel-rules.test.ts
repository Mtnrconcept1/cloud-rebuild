import { describe, expect, it } from "vitest";
import {
  allowAutomaticGlobalContainment,
  detectSentinelFindings,
  sentinelReport,
  type CriticalProof,
  type SentinelAudit,
} from "../../supabase/functions/_shared/tok-sentinel-rules.ts";
const now = Date.parse("2026-10-29T03:00:00Z");
const uid = (n: number) => "e9cc2b20-0000-4000-8000-" + String(n).padStart(12, "0");
function event(n: number, different = false): SentinelAudit {
  return {
    id: uid(n), created_at: new Date(now - 3000).toISOString(),
    function_name: different ? "create-reservation" : "create-checkout",
    action: "forbidden", status: "failure", error_message: "Unauthorized",
    actor_user_id: uid(42), request_metadata: { ip: "192.0.2.1" },
  };
}
const proof = (source: CriticalProof["source"]): CriticalProof => ({
  category: "confirmed_rls_bypass", source, verified: true,
  observedAt: new Date(now - 1000).toISOString(), evidenceRef: uid(90),
});
describe("sentinel correlation", () => {
  it("does not escalate isolated failures", () => {
    expect(detectSentinelFindings([event(1)], now)).toHaveLength(0);
  });
  it("proposes only scoped manual containment", () => {
    const findings = detectSentinelFindings(Array.from({ length: 8 }, (_, n) => event(n + 1, n % 2 === 0)), now);
    expect(findings.find((x) => x.category === "authorization_probing")?.scope).toBe("administration");
    expect(findings.every((x) => x.scope !== "global")).toBe(true);
    expect(sentinelReport("authorization_probing", 8, ["create-checkout"]).repair_steps.length).toBeGreaterThan(0);
  });
  it("needs two independent verified sources to permit a critical automatic action", () => {
    const witnesses = [proof("independent_monitor"), proof("database_guard")];
    expect(allowAutomaticGlobalContainment("confirmed_rls_bypass", witnesses, now, true, true)).toBe(true);
    expect(allowAutomaticGlobalContainment("confirmed_rls_bypass", witnesses, now, false, true)).toBe(false);
    expect(allowAutomaticGlobalContainment("payment_abuse", witnesses, now, true, true)).toBe(false);
    expect(allowAutomaticGlobalContainment("confirmed_rls_bypass", [proof("database_guard")], now, true, true)).toBe(false);
    expect(allowAutomaticGlobalContainment("confirmed_rls_bypass",
      [proof("database_guard"), { ...proof("independent_monitor"), verified: false }],
      now, true, true)).toBe(false);
  });
});
