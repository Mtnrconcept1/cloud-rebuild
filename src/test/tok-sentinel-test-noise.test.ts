import { describe, expect, it } from "vitest";
import {
  detectSentinelFindings, isAuthorizedTestNoise,
  type SentinelAudit, type SentinelFinding,
} from "../../supabase/functions/_shared/tok-sentinel-rules.ts";

const now = Date.parse("2026-10-29T07:30:00Z");
const allowedUser = "11111111-1111-4111-8111-111111111111";
const secondAllowedUser = "22222222-2222-4222-8222-222222222222";
const otherUser = "33333333-3333-4333-8333-333333333333";
const uuid = (n: number) => "99999999-9999-4999-8999-" + String(n).padStart(12, "0");
const allowed = new Set([allowedUser, secondAllowedUser]);

function audit(
  n: number,
  patch: Partial<SentinelAudit> = {},
): SentinelAudit {
  return {
    id: uuid(n), created_at: new Date(now - 5_000).toISOString(),
    function_name: n % 2 ? "create-checkout" : "create-reservation",
    action: "forbidden", status: "failure", error_message: "Unauthorized",
    actor_user_id: allowedUser, is_service_role: false,
    request_metadata: { ip: "192.0.2.7" },
    ...patch,
  };
}
function aFinding(rows: SentinelAudit[], category = "authorization_probing"): SentinelFinding {
  const finding = detectSentinelFindings(rows, now).find((item) => item.category === category);
  if (!finding) throw new Error("Expected a correlation in the fixture");
  return finding;
}

describe("time-bound authorized production QA noise", () => {
  it("downgrades fully attributed routine test errors, preserving original audit evidence", () => {
    const rows = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    const finding = aFinding(rows);
    expect(isAuthorizedTestNoise(finding, rows, allowed)).toBe(true);
    expect(rows).toHaveLength(8);
    expect(finding.evidenceIds).toHaveLength(8);
  });

  it("never trusts a missing or unconfigured allowlist", () => {
    const rows = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    expect(isAuthorizedTestNoise(aFinding(rows), rows, new Set())).toBe(false);
    expect(isAuthorizedTestNoise(aFinding(rows), rows, new Set([otherUser]))).toBe(false);
  });

  it("does not mute an IP shared with another user, including the third actor", () => {
    const rows = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    rows[7] = audit(8, { actor_user_id: otherUser });
    expect(isAuthorizedTestNoise(aFinding(rows), rows, allowed)).toBe(false);
  });

  it("preserves alerts for missing actor attribution, service-role events and missing proof", () => {
    const baseline = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    for (const patch of [
      { actor_user_id: null },
      { is_service_role: true },
      { is_service_role: undefined },
    ]) {
      const rows = baseline.map((row, i) => i === 0 ? { ...row, ...patch } : row);
      expect(isAuthorizedTestNoise(aFinding(rows), rows, allowed)).toBe(false);
    }
    const missingEvidence = baseline.slice(1);
    expect(isAuthorizedTestNoise(aFinding(baseline), missingEvidence, allowed)).toBe(false);
  });

  it("keeps alerts when evidence is truncated or duplicated", () => {
    const rows = Array.from({ length: 36 }, (_, i) => audit(i + 1));
    expect(isAuthorizedTestNoise(aFinding(rows), rows, allowed)).toBe(false);
    const small = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    const original = aFinding(small);
    expect(isAuthorizedTestNoise({
      ...original,
      evidenceIds: [...original.evidenceIds.slice(0, 7), original.evidenceIds[0]],
    }, small, allowed)).toBe(false);
  });

  it("keeps financial-change and identity/security functions visible", () => {
    const dangerous = ["process-refund", "stripe-connect-onboard", "ops-incident-control", "admin-role-update"];
    for (const function_name of dangerous) {
      const rows = Array.from({ length: 8 }, (_, i) =>
        audit(i + 1, { function_name: i % 2 ? function_name : "create-reservation" }));
      expect(isAuthorizedTestNoise(aFinding(rows), rows, allowed)).toBe(false);
    }
  });

  it("keeps warnings on confirmed intrusion evidence even from known users", () => {
    const dangerous = ["confirmed_rls_bypass", "data_exfiltration", "privilege_escalation", "credential_leak"];
    for (const message of dangerous) {
      const rows = Array.from({ length: 8 }, (_, i) =>
        audit(i + 1, { error_message: i === 0 ? message : "Forbidden" }));
      expect(isAuthorizedTestNoise(aFinding(rows), rows, allowed)).toBe(false);
    }
    const rows = Array.from({ length: 8 }, (_, i) => audit(i + 1));
    expect(isAuthorizedTestNoise({ ...aFinding(rows), severity: "critical" }, rows, allowed)).toBe(false);
    expect(isAuthorizedTestNoise({ ...aFinding(rows), scope: "global" }, rows, allowed)).toBe(false);
  });

  it("mutes only low-risk checkout retries, never refund or settlement attempts", () => {
    const checkoutRows = Array.from({ length: 12 }, (_, i) =>
      audit(i + 1, { function_name: "create-checkout", error_message: "Card declined" }));
    expect(isAuthorizedTestNoise(aFinding(checkoutRows, "payment_abuse"), checkoutRows, allowed)).toBe(true);

    const refundRows = Array.from({ length: 12 }, (_, i) =>
      audit(i + 1, { function_name: "process-refund", error_message: "Card declined" }));
    expect(isAuthorizedTestNoise(aFinding(refundRows, "payment_abuse"), refundRows, allowed)).toBe(false);
  });
});
