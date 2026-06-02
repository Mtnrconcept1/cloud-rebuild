import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("send-push Firebase service account resilience", () => {
  it("supports separate Firebase env vars when the JSON secret is absent or malformed", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/send-push/index.ts"), "utf8");
    const secrets = readFileSync(resolve(process.cwd(), "scripts/write-supabase-secrets-env.mjs"), "utf8");
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy-production.yml"), "utf8");

    expect(source).toContain("readFirebaseServiceAccountFromEnv");
    expect(source).toContain("FIREBASE_PROJECT_ID");
    expect(source).toContain("FIREBASE_CLIENT_EMAIL");
    expect(source).toContain("FIREBASE_PRIVATE_KEY");
    expect(source).toContain("FIREBASE_TOKEN_URI");
    expect(source).toContain("firebase_service_account_invalid_json");
    expect(source).toContain("firebase_service_account_invalid_format");
    expect(source).toContain("firebase_service_account_missing");
    expect(source).toContain("validateFirebaseServiceAccount");
    expect(source).toContain("base64UrlEncode");
    expect(source).toContain(".gserviceaccount.com");
    expect(source).toContain("-----BEGIN PRIVATE KEY-----");

    for (const name of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_TOKEN_URI"]) {
      expect(secrets).toContain(`"${name}"`);
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });
});
