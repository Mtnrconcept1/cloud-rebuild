import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("social composer scheduling", () => {
  it("lets restaurateurs schedule posts instead of forcing immediate publication", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/social/SocialComposer.tsx"), "utf8");

    expect(source).toContain('type="datetime-local"');
    expect(source).toContain("scheduledAt: scheduledAt || null");
    expect(source).toContain("const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null");
    expect(source).toContain("scheduledAt: scheduledIso");
    expect(source).toContain('{createPost.isPending ? "Compression..." : scheduledAt ? "Programmer" : "Publier"}');
    expect(source).not.toContain("scheduledAt: null");
  });

  it("refuses scheduled posts when the backend schema cannot store scheduled_at", () => {
    const source = readFileSync(resolve(process.cwd(), "src/hooks/useSocialFeed.ts"), "utf8");

    expect(source).toContain("if (scheduledIso) {");
    expect(source).toContain("La programmation des actualites n'est pas encore disponible cote serveur.");
    expect(source).toContain('status: "published"');
  });
});
