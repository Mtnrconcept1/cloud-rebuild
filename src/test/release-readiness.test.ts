import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectReleaseReadiness } from "../../scripts/release-readiness.mjs";

const fixtures: string[] = [];

function makeFixture(name: string) {
  const root = path.join(process.cwd(), ".tmp", `release-readiness-${name}-${Date.now()}`);
  fixtures.push(root);
  mkdirSync(path.join(root, "public", ".well-known"), { recursive: true });
  mkdirSync(path.join(root, "android"), { recursive: true });
  return root;
}

function writeJson(root: string, relativePath: string, value: unknown) {
  writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function firebaseServiceAccountJson() {
  return JSON.stringify({
    type: "service_account",
    project_id: "tok-prod",
    client_email: "firebase-adminsdk@test.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("release readiness inspection", () => {
  it("reports missing production release requirements as warnings in advisory mode", () => {
    const root = makeFixture("advisory-missing");

    const result = inspectReleaseReadiness({
      root,
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(result.strict).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("Missing public/.well-known/apple-app-site-association for iOS Universal Links.");
    expect(result.warnings).toContain("Missing STRIPE_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK for production payment capture.");
    expect(result.warnings).toContain(
      "Missing STRIPE_PERSONNAL_SECRET_KEY, STRIPE_PERSONAL_SECRET_KEY, STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY live secret for production payments.",
    );
    expect(result.warnings).toContain("Missing SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE with Dashboard/API proof for issue #204.");
  });

  it("flags missing mobile association files and production credentials in strict mode", () => {
    const root = makeFixture("missing");

    const result = inspectReleaseReadiness({
      root,
      env: {},
      strict: true,
    });

    expect(result.ok).toBe(false);
    expect(result.strict).toBe(true);
    expect(result.errors).toContain("Missing public/.well-known/apple-app-site-association for iOS Universal Links.");
    expect(result.errors).toContain("Missing public/.well-known/assetlinks.json for Android App Links.");
    expect(result.errors).toContain("Missing Android release keystore config at android/keystore.properties.");
    expect(result.errors).toContain("Missing STRIPE_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK for production payment capture.");
    expect(result.errors).toContain(
      "Missing STRIPE_PERSONNAL_SECRET_KEY, STRIPE_PERSONAL_SECRET_KEY, STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY live secret for production payments.",
    );
    expect(result.errors).toContain("Missing SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED=true after verifying Supabase Auth leaked password protection for production.");
    expect(result.errors).toContain("Missing SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE with Dashboard/API proof for issue #204.");
  });

  it("keeps strict web deployment independent from Apple and Android release material", () => {
    const root = makeFixture("web-ready-without-mobile");

    const result = inspectReleaseReadiness({
      root,
      target: "web",
      env: {
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY_LIVE: "sk_live_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
        FIREBASE_SERVICE_ACCOUNT: firebaseServiceAccountJson(),
        INTERNAL_CRON_SECRET: "long-random-secret",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "Tok <noreply@thetok.ch>",
        APP_BASE_URL: "https://www.thetok.ch",
        PUBLIC_APP_URL: "https://www.thetok.ch",
        ALLOWED_ORIGINS: "https://www.thetok.ch",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED: "true",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE: "Management API live proof for issue #204",
      },
      strict: true,
    });

    expect(result.ok).toBe(true);
    expect(result.target).toBe("web");
    expect(result.errors).toEqual([]);
    expect(result.errors.join("\n")).not.toMatch(/Apple|Android|assetlinks|keystore/i);
  });

  it("accepts configured app links, mobile signing, and critical production secrets", () => {
    const root = makeFixture("ready");
    writeJson(root, "public/.well-known/apple-app-site-association", {
      applinks: {
        apps: [],
        details: [{ appIDs: ["TEAM123456.com.tok.app"], components: [{ "/": "/*" }] }],
      },
    });
    writeJson(root, "public/.well-known/assetlinks.json", [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.tok.app",
          sha256_cert_fingerprints: ["AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"],
        },
      },
    ]);
    writeFileSync(path.join(root, "android", "keystore.properties"), "storeFile=release.jks\n", "utf8");

    const result = inspectReleaseReadiness({
      root,
      env: {
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY_LIVE: "sk_live_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
        FIREBASE_SERVICE_ACCOUNT: firebaseServiceAccountJson(),
        INTERNAL_CRON_SECRET: "long-random-secret",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "Tok <noreply@thetok.ch>",
        APP_BASE_URL: "https://app.thetok.ch",
        PUBLIC_APP_URL: "https://www.thetok.ch",
        ALLOWED_ORIGINS: "https://app.thetok.ch,https://www.thetok.ch",
        APPLE_TEAM_ID: "TEAM123456",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED: "true",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE: "GitHub issue #204 dashboard proof 2026-06-16",
      },
      strict: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts STRIPE_LIVE_WEBHOOK as the production webhook signing secret alias", () => {
    const root = makeFixture("ready-live-webhook-alias");
    writeJson(root, "public/.well-known/apple-app-site-association", {
      applinks: {
        apps: [],
        details: [{ appIDs: ["TEAM123456.com.tok.app"], components: [{ "/": "/*" }] }],
      },
    });
    writeJson(root, "public/.well-known/assetlinks.json", [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.tok.app",
          sha256_cert_fingerprints: ["AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"],
        },
      },
    ]);
    writeFileSync(path.join(root, "android", "keystore.properties"), "storeFile=release.jks\n", "utf8");

    const result = inspectReleaseReadiness({
      root,
      env: {
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY: "sk_live_123",
        STRIPE_LIVE_WEBHOOK: "whsec_live_alias",
        FIREBASE_SERVICE_ACCOUNT: firebaseServiceAccountJson(),
        INTERNAL_CRON_SECRET: "long-random-secret",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "Tok <noreply@thetok.ch>",
        APP_BASE_URL: "https://app.thetok.ch",
        PUBLIC_APP_URL: "https://www.thetok.ch",
        ALLOWED_ORIGINS: "https://app.thetok.ch,https://www.thetok.ch",
        APPLE_TEAM_ID: "TEAM123456",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED: "true",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE: "GitHub issue #204 dashboard proof 2026-06-16",
      },
      strict: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts STRIPE_PERSONNAL_SECRET_KEY when STRIPE_SECRET_KEY stores the public key", () => {
    const root = makeFixture("ready-personnal-secret-alias");
    writeJson(root, "public/.well-known/apple-app-site-association", {
      applinks: {
        apps: [],
        details: [{ appIDs: ["TEAM123456.com.tok.app"], components: [{ "/": "/*" }] }],
      },
    });
    writeJson(root, "public/.well-known/assetlinks.json", [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.tok.app",
          sha256_cert_fingerprints: ["AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"],
        },
      },
    ]);
    writeFileSync(path.join(root, "android", "keystore.properties"), "storeFile=release.jks\n", "utf8");

    const result = inspectReleaseReadiness({
      root,
      env: {
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY: "pk_live_123",
        STRIPE_PERSONNAL_SECRET_KEY: "sk_live_123",
        STRIPE_LIVE_WEBHOOK: "whsec_live_alias",
        FIREBASE_SERVICE_ACCOUNT: firebaseServiceAccountJson(),
        INTERNAL_CRON_SECRET: "long-random-secret",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "Tok <noreply@thetok.ch>",
        APP_BASE_URL: "https://app.thetok.ch",
        PUBLIC_APP_URL: "https://www.thetok.ch",
        ALLOWED_ORIGINS: "https://app.thetok.ch,https://www.thetok.ch",
        APPLE_TEAM_ID: "TEAM123456",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED: "true",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE: "GitHub issue #204 dashboard proof 2026-06-16",
      },
      strict: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects an Apple association that targets a different bundle", () => {
    const root = makeFixture("wrong-apple-bundle");
    writeJson(root, "public/.well-known/apple-app-site-association", {
      applinks: {
        apps: [],
        details: [{ appIDs: ["TEAM123456.com.example.app"], components: [{ "/": "/*" }] }],
      },
    });

    const result = inspectReleaseReadiness({
      root,
      env: { APPLE_TEAM_ID: "TEAM123456" },
      strict: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "apple-app-site-association must contain exactly APPLE_TEAM_ID.com.tok.app.",
    );
  });

  it("rejects incomplete Firebase service account JSON before deployment", () => {
    const root = makeFixture("bad-firebase");
    writeJson(root, "public/.well-known/apple-app-site-association", {
      applinks: {
        apps: [],
        details: [{ appIDs: ["TEAM123456.com.tok.app"], components: [{ "/": "/*" }] }],
      },
    });
    writeJson(root, "public/.well-known/assetlinks.json", [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.tok.app",
          sha256_cert_fingerprints: ["AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"],
        },
      },
    ]);
    writeFileSync(path.join(root, "android", "keystore.properties"), "storeFile=release.jks\n", "utf8");

    const result = inspectReleaseReadiness({
      root,
      env: {
        VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_123",
        STRIPE_SECRET_KEY: "sk_live_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
        FIREBASE_SERVICE_ACCOUNT: "{\"type\":\"service_account\"}",
        INTERNAL_CRON_SECRET: "long-random-secret",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "Tok <noreply@thetok.ch>",
        APP_BASE_URL: "https://app.thetok.ch",
        PUBLIC_APP_URL: "https://www.thetok.ch",
        ALLOWED_ORIGINS: "https://app.thetok.ch,https://www.thetok.ch",
        APPLE_TEAM_ID: "TEAM123456",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED: "true",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE: "GitHub issue #204 dashboard proof 2026-06-16",
      },
      strict: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("FIREBASE_SERVICE_ACCOUNT must be valid service account JSON or base64 JSON with project_id, client_email, private_key and token_uri.");
  });
});
