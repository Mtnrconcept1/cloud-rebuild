import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("send-push Firebase service account resilience", () => {
  it("supports separate Firebase env vars when the JSON secret is absent or malformed", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/send-push/index.ts"), "utf8");

    expect(source).toContain("readFirebaseServiceAccountFromEnv");
    expect(source).toContain("FIREBASE_PROJECT_ID");
    expect(source).toContain("FIREBASE_CLIENT_EMAIL");
    expect(source).toContain("FIREBASE_PRIVATE_KEY");
    expect(source).toContain("FIREBASE_TOKEN_URI");
    expect(source).toContain("firebase_service_account_invalid_json");
    expect(source).toContain("firebase_service_account_missing");
  });
});
