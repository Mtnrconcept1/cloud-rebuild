import { describe, expect, it } from "vitest";

import { FIREBASE_VAPID_KEY_ERROR, isValidP256PublicVapidKey } from "@/lib/push";

const VALID_P256_PUBLIC_KEY =
  "BFR0rat1W7oapUzxHddOpVna4W-oBLpNQIBEZeiPlv81khk2Trz3PQbH4zo4vlDZXFW9nf8he5OCGK-EMQbOCUg";

describe("Firebase web push VAPID key validation", () => {
  it("accepts a base64url encoded uncompressed P-256 public key", () => {
    expect(isValidP256PublicVapidKey(VALID_P256_PUBLIC_KEY)).toBe(true);
  });

  it("rejects Firebase service account JSON and private keys", () => {
    expect(isValidP256PublicVapidKey(JSON.stringify({ type: "service_account" }))).toBe(false);
    expect(isValidP256PublicVapidKey("-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----")).toBe(false);
  });

  it("keeps the user-facing fix tied to VITE_FIREBASE_VAPID_KEY", () => {
    expect(FIREBASE_VAPID_KEY_ERROR).toContain("VITE_FIREBASE_VAPID_KEY");
    expect(FIREBASE_VAPID_KEY_ERROR).toContain("Web Push certificates");
  });
});
