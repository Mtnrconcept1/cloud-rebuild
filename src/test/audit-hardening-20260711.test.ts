import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  const absolutePath = resolve(process.cwd(), path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("2026-07-11 audit hardening", () => {
  it("keeps image-analysis worker RPCs service-role only", () => {
    const migration = readProjectFile("supabase/migrations/20260711120000_audit_security_hardening.sql");

    for (const signature of [
      "public.enqueue_image_analysis_job()",
      "public.claim_image_analysis_jobs(text, integer)",
      "public.claim_image_analysis_job_by_image_id(text, uuid)",
      "public.fail_image_analysis_job(uuid, uuid, text)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }

    expect(migration).not.toContain("TO anon");
    expect(migration).not.toContain("TO authenticated");
  });

  it("fails closed when reservation availability cannot be verified", () => {
    const card = readProjectFile("src/components/RestaurantCard.tsx");

    expect(card).toContain("isError: slotAvailabilityError");
    expect(card).toContain("throw new Error(error.message)");
    expect(card).toContain("if (!serverSlot) return false");
    expect(card).not.toContain("Restaurant card reservation availability fallback");
  });

  it("does not render test commercial access in production", () => {
    const auth = readProjectFile("src/pages/Auth.tsx");

    expect(auth).toContain("COMMERCIAL_DEMO_LOGINS.length > 0");
    expect(auth).toContain('robots: "noindex,nofollow"');
  });
});
