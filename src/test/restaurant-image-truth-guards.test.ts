import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904173100_restaurant_image_truth_guards.sql",
  "utf8",
);

describe("restaurant image truth queue guards", () => {
  it("prevents one verified byte-identical image from representing multiple restaurants", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_image_truth_verified_sha256",
    );
    expect(migration).toMatch(
      /ON public\.restaurant_image_truth_reviews \(image_sha256\)[\s\S]*WHERE status = 'verified'[\s\S]*image_sha256 IS NOT NULL/,
    );
  });

  it("does not let discovery reopen a terminal decision", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.preserve_terminal_restaurant_image_truth_review()",
    );
    expect(migration).toContain(
      "OLD.status IN ('verified', 'rejected', 'manual_review')",
    );
    expect(migration).toContain("NEW.status IN ('queued', 'retry')");
    expect(migration).toContain("NEW.status := OLD.status");
    expect(migration).toContain("NEW.evidence := OLD.evidence");
    expect(migration).toContain(
      "CREATE TRIGGER trg_preserve_terminal_restaurant_image_truth_review",
    );
  });

  it("is additive and never removes restaurant or Storage data", () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(?:public\.)?restaurants/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.preserve_terminal_restaurant_image_truth_review()",
    );
  });
});
