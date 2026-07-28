import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildErrorCodeMap, renderModule } from "../../scripts/generate-error-code-map.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("incident evidence depth", () => {
  const control = read("supabase/functions/ops-incident-control/index.ts");
  const openai = read("supabase/functions/_shared/openai.ts");
  const auth = read("supabase/functions/_shared/auth.ts");
  const dailyDish = read("supabase/functions/daily-dish-ai/index.ts");
  const generated = read("supabase/functions/_shared/error-code-map.ts");

  it("keeps the generated error-code map in sync with the source", () => {
    // Regenerating must be a no-op: a moved or added HttpError would otherwise
    // send the analyser to a line that no longer raises anything. Any edit under
    // supabase/functions can shift these lines, which is precisely why this is
    // checked rather than trusted.
    expect(
      generated,
      "error-code-map.ts is stale — run `pnpm run generate:error-code-map` and commit the result.",
    ).toBe(renderModule(buildErrorCodeMap()));
  });

  it("resolves an error code to the real lines that raise it", () => {
    const map = buildErrorCodeMap();

    // The code from the reported incident, and the throw site behind it.
    expect(map).toHaveProperty("ai_empty_response");
    expect(map.ai_empty_response).toContainEqual(
      expect.objectContaining({ file: "supabase/functions/_shared/openai.ts" }),
    );

    // Empty and invalid are distinct paths; conflating them was what made the
    // Telegram report list parsing as a candidate cause.
    expect(map).toHaveProperty("ai_invalid_response");
    expect(map.ai_empty_response).not.toEqual(map.ai_invalid_response);

    expect(generated).toContain("export function lookupErrorCodeSites");
    // An unknown code must yield nothing rather than a plausible-looking path.
    expect(generated).toContain("return ERROR_CODE_SITES[normalized] ?? [];");
  });

  it("captures why an AI response was unusable instead of discarding it", () => {
    expect(openai).toContain("export function describeResponseEnvelope");
    for (const field of [
      "response_status",
      "incomplete_reason",
      "max_output_tokens",
      "reasoning_tokens",
      "refusal",
    ]) {
      expect(openai).toContain(field);
    }

    // Both AI failure codes carry the envelope.
    expect(openai).toContain('throw new HttpError(502, "ai_empty_response", describeResponseEnvelope(data));');
    expect(openai).toContain('throw new HttpError(502, "ai_invalid_response", {');

    // No prompt or completion text may travel with the diagnostics.
    expect(openai).toContain("text_length: text.length");
    expect(openai).not.toContain("prompt: input");
  });

  it("leaves the proposals call enough budget to emit an answer after reasoning", () => {
    // The observed ai_empty_response incidents are consistent with reasoning
    // consuming the whole budget: the call is billed and returns nothing. The
    // ceiling has to sit above reasoning plus three fully costed dishes.
    expect(dailyDish).toContain("maxOutputTokens: isRefinement ? 8000 : 20_000");
    expect(dailyDish).not.toContain("maxOutputTokens: isRefinement ? 5000 : 12_000");
  });

  it("carries error diagnostics from the throw site into the audit log", () => {
    expect(auth).toContain("details?: Record<string, unknown>");
    expect(auth).toContain("export function errorDiagnostics");
    expect(dailyDish).toContain("metadata: { rid: log.rid, ...errorDiagnostics(error) }");
  });

  it("gives the analyser real paths, runtime facts and blast radius", () => {
    expect(control).toContain("function buildFailureEvidence");
    expect(control).toContain("lookupErrorCodeSites");

    for (const block of [
      "source_files",
      "error_code_sites",
      "runtime_diagnostics",
      "impact_scope",
      "distinct_clients",
      "first_failure_at",
    ]) {
      expect(control).toContain(block);
    }

    // The function's own entrypoint is always inspectable.
    expect(control).toContain("`supabase/functions/${failure.functionName}/index.ts`");

    // The prompt must teach the analyser to read the new blocks, while keeping
    // the guardrail that a path has to appear in the evidence.
    expect(control).toContain("La liste files_to_inspect doit contenir uniquement des chemins littéralement présents");
    expect(control).toContain("sanitized_context.runtime_diagnostics");
    expect(control).toContain("max_output_tokens");
    expect(control).toContain("ne l'augmente jamais au-delà de ce que les preuves établissent");
  });
});
