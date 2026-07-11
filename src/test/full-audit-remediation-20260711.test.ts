import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  const absolute = resolve(process.cwd(), path);
  expect(existsSync(absolute), `${path} should exist`).toBe(true);
  return readFileSync(absolute, "utf8");
}

describe("full audit remediation", () => {
  it("submits restaurant leads through the secured support pipeline", () => {
    const page = source("src/pages/RestaurateursGeneve.tsx");
    expect(page).toContain("submitContactSupport");
    expect(page).toContain('action="restaurant_lead"');
    expect(page).toContain("isCaptchaEnabled()");
    expect(page).not.toContain("mailto:");
  });

  it("uses the approved four-plan pricing", () => {
    const page = source("src/pages/RestaurateursGeneve.tsx");
    expect(page).toContain('monthlyFee: 69');
    expect(page).toContain('monthlyFee: 129');
    expect(page).toContain('monthlyFee: 199');
    expect(page).toContain('monthlyFee: 499');
    expect(page).not.toContain('monthlyFee: 0');
    expect(page).not.toContain('monthlyFee: 149');
    expect(page).not.toContain('monthlyFee: 349');
  });

  it("never logs order or customer details in the frontend email fallback", () => {
    const email = source("src/lib/email-service.ts");
    expect(email).toContain("crypto?.randomUUID");
    expect(email).not.toContain("console.log");
    expect(email).not.toContain("customerEmail:");
    expect(email).not.toContain("Email Fallback");
  });

  it("refreshes cached data after focus and reconnect", () => {
    const app = source("src/App.tsx");
    expect(app).toContain("refetchOnWindowFocus: true");
    expect(app).toContain("refetchOnReconnect: true");
    expect(app).not.toContain("focusManager.setEventListener");
  });

  it("revokes anonymous access from audited privileged RPCs", () => {
    const migration = source("supabase/migrations/20260711153000_comprehensive_rpc_privilege_hardening.sql");
    expect(migration).toContain("restaurant_upsert_flash_sale");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA public");
  });
});
