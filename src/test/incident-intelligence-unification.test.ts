import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  const absolute = resolve(root, path);
  expect(existsSync(absolute), `${path} should exist`).toBe(true);
  return readFileSync(absolute, "utf8");
}

describe("unified incident intelligence", () => {
  it("adds a canonical evidence cache and an admin-only support to ops link", () => {
    const sql = read(
      "supabase/migrations/20260801130000_unify_incident_intelligence.sql",
    );

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS evidence_hash");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS repairability");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS context_hash");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.support_ops_incident_links",
    );
    expect(sql).toContain(
      "ALTER TABLE public.support_ops_incident_links ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain("USING (public.auth_is_admin())");
    expect(sql).toContain("GRANT ALL ON public.support_ops_incident_links TO service_role");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("classifies incidents deterministically before spending tokens", () => {
    const shared = read(
      "supabase/functions/_shared/incident-intelligence.ts",
    );

    for (const repairability of [
      "code",
      "configuration",
      "data",
      "third_party",
      "transient",
      "expected_business_rule",
      "unknown",
    ]) {
      expect(shared).toContain(`\"${repairability}\"`);
    }

    expect(shared).toContain("buildIncidentEvidenceHash");
    expect(shared).toContain("buildStableEvidenceHash");
    expect(shared).toContain("classifyIncidentRepairability");
    expect(shared).toContain("shouldUseDeepIncidentAnalysis");
    expect(shared).toContain("selectSupportMessages");
    expect(shared).toContain("maxMessages = 28");
  });

  it("makes Telegram/Codex the canonical technical diagnosis and blocks non-code dispatches", () => {
    const ops = read("supabase/functions/ops-incident-control/index.ts");

    expect(ops).toContain("INCIDENT_ANALYSIS_VERSION = 2");
    expect(ops).toContain("INCIDENT_TRIAGE_OUTPUT_TOKENS = 900");
    expect(ops).toContain("recordIncidentAiUsage");
    expect(ops).toContain("analysis_cached");
    expect(ops).toContain("evidence_hash");
    expect(ops).toContain("repairability");
    expect(ops).toContain('verbosity: "low"');
    expect(ops).toContain("triage_approved_without_codex");
    expect(ops).toContain("codex_eligible");
    expect(ops).toContain("assertIngestAuthorized");
    expect(ops).not.toContain("maxOutputTokens: 2400");
  });

  it("reuses the canonical plan in Guardian and deep-analyzes only on demand or risk", () => {
    const guardian = read("supabase/functions/ai-guardian/index.ts");

    expect(guardian).toContain("GUARDIAN_ANALYSIS_VERSION = 2");
    expect(guardian).toContain("GUARDIAN_DEEP_OUTPUT_TOKENS = 1600");
    expect(guardian).toContain("buildCanonicalGuardianAssessment");
    expect(guardian).toContain("guardian_reused_canonical_plan");
    expect(guardian).toContain("forceDeepAnalysis");
    expect(guardian).toContain("shouldUseDeepIncidentAnalysis");
    expect(guardian).toContain('analysis_source: "canonical"');
    expect(guardian).toContain('analysis_source: "deep"');
    expect(guardian).not.toContain("maxOutputTokens: 3600");
  });

  it("links Support Resolution to the technical queue without sending the conversation", () => {
    const support = read(
      "supabase/functions/ai-support-resolution/index.ts",
    );

    expect(support).toContain('"escalate_technical_incident"');
    expect(support).toContain("selectSupportMessages");
    expect(support).toContain("buildSupportMessageDigest");
    expect(support).toContain("context_hash");
    expect(support).toContain("cached_from_run_id");
    expect(support).toContain("invokeOpsIncidentControl");
    expect(support).toContain("support_ops_incident_links");
    expect(support).toContain("buildSupportTechnicalEvidence");
    expect(support).toContain('verbosity: "low"');
    expect(support).toContain("SUPPORT_ANALYSIS_OUTPUT_TOKENS = 1400");
    expect(support).not.toContain("maxOutputTokens: 2600");
    expect(support).not.toContain("messages: context.messages,\n          technical_evidence");
  });

  it("tracks cache and reasoning usage and knows GPT-5.6 pricing", () => {
    const openai = read("supabase/functions/_shared/openai.ts");
    const pricing = read("supabase/functions/_shared/ai-pricing.ts");

    expect(openai).toContain("cached_input_tokens");
    expect(openai).toContain("cache_write_tokens");
    expect(openai).toContain("reasoning_tokens");
    expect(openai).toContain('"incident_triage"');
    expect(openai).toContain('"incident_deep"');
    expect(openai).toContain('"support_resolution"');
    expect(openai).toContain('"support_resolution_complex"');
    expect(openai).toContain("gpt-5.6-terra");

    expect(pricing).toContain('"gpt-5.6-sol"');
    expect(pricing).toContain('"gpt-5.6-terra"');
    expect(pricing).toContain('"gpt-5.6-luna"');
  });
});
