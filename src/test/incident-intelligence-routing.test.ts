import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getOpenAITextCreditUnits } from "../../supabase/functions/_shared/ai-pricing";
import {
  buildStableEvidenceHash,
  buildSupportTechnicalEvidence,
  classifyIncidentRepairability,
} from "../../supabase/functions/_shared/incident-intelligence";

const root = process.cwd();

describe("incident intelligence routing behavior", () => {
  it("does not send a provider timeout to Codex merely because an entrypoint is known", () => {
    const decision = classifyIncidentRepairability({
      source: "edge_audit",
      severity: "high",
      summary: "Resend provider timeout: upstream service unavailable",
      technicalDetails: {
        provider: "resend",
        error_message: "provider_timeout",
      },
      context: {
        source_files: ["supabase/functions/send-email/index.ts"],
      },
    });

    expect(decision.repairability).toBe("third_party");
    expect(decision.codexEligible).toBe(false);
  });

  it("routes SQL state failures to data review even when the throw site is known", () => {
    const decision = classifyIncidentRepairability({
      source: "edge_audit",
      severity: "high",
      summary: "PGRST SQLSTATE 23503 foreign key constraint violation",
      context: {
        source_files: ["supabase/functions/order-sync/index.ts"],
        error_code_sites: [{
          file: "supabase/functions/order-sync/index.ts",
          line: 241,
        }],
      },
    });

    expect(decision.repairability).toBe("data");
    expect(decision.codexEligible).toBe(false);
  });

  it("keeps reproducible test failures eligible for the isolated Codex workflow", () => {
    const decision = classifyIncidentRepairability({
      source: "github_actions",
      severity: "high",
      summary: "AssertionError: route wiring test failed",
      context: {
        source_files: ["src/test/route-wiring.test.ts"],
      },
    });

    expect(decision.repairability).toBe("code");
    expect(decision.codexEligible).toBe(true);
  });

  it("deduplicates support symptoms independently from case and transaction identifiers", async () => {
    const first = buildSupportTechnicalEvidence({
      metadata: {
        function_name: "daily-dish-ai",
        error_code: "provider_timeout",
        route: "/functions/v1/daily-dish-ai?user=2f4c98d0-03f7-4e72-910a-0c34a892ca21",
        request_id: "request-111111",
      },
      order: {
        id: "2f4c98d0-03f7-4e72-910a-0c34a892ca21",
        status: "pending",
        payment_status: "paid",
        created_at: "2026-08-01T10:00:00Z",
      },
      payments: [{
        id: "11111111-1111-4111-8111-111111111111",
        type: "payment",
        status: "succeeded",
        provider: "stripe",
        created_at: "2026-08-01T10:00:00Z",
      }],
    });
    const second = buildSupportTechnicalEvidence({
      metadata: {
        function_name: "daily-dish-ai",
        error_code: "provider_timeout",
        route: "/functions/v1/daily-dish-ai?user=891a6eef-5be3-4d4a-9887-2e4f27bf39ee",
        request_id: "request-999999",
      },
      order: {
        id: "891a6eef-5be3-4d4a-9887-2e4f27bf39ee",
        status: "pending",
        payment_status: "paid",
        created_at: "2026-08-01T14:00:00Z",
      },
      payments: [{
        id: "99999999-9999-4999-8999-999999999999",
        type: "payment",
        status: "succeeded",
        provider: "stripe",
        created_at: "2026-08-01T14:00:00Z",
      }],
    });

    expect(second).toEqual(first);
    expect(await buildStableEvidenceHash(second)).toBe(
      await buildStableEvidenceHash(first),
    );
    expect(JSON.stringify(first)).not.toContain("2f4c98d0");
    expect(JSON.stringify(first)).not.toContain("request-");
  });

  it("does not debit an AI credit when no provider token was consumed", () => {
    expect(getOpenAITextCreditUnits("gpt-5.6-terra", 0, 0)).toBe(0);
    expect(getOpenAITextCreditUnits("gpt-5.6-terra", 1, 1)).toBeGreaterThan(0);
  });

  it("loads the latest support window and exposes the linked technical incident to admins", () => {
    const support = readFileSync(
      resolve(root, "supabase/functions/ai-support-resolution/index.ts"),
      "utf8",
    );
    const supportUi = readFileSync(
      resolve(root, "src/pages/admin/AdminSupportResolution.tsx"),
      "utf8",
    );
    const guardianUi = readFileSync(
      resolve(root, "src/pages/admin/AdminGuardian.tsx"),
      "utf8",
    );

    expect(support).toContain(
      '.order("created_at", { ascending: false })\n    .limit(80);',
    );
    expect(support).toContain("const sanitizedMessages = [...(messages || [])]");
    expect(support).toContain("technical_evidence: technicalEvidence");
    expect(support).not.toContain(
      "support_incident_id: context.incident.id,\n          technical_evidence: technicalEvidence",
    );
    expect(supportUi).toContain("workspaceQuery.data?.ops_incidents");
    expect(supportUi).toContain("Ouvrir dans Guardian");
    expect(guardianUi).toContain("forceDeepAnalysis:");
  });
});
