import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COMMERCIAL_DEMO_LOGINS, getCommercialDemoLogin } from "@/lib/commercialDemoLogins";

const root = process.cwd();
const authSource = readFileSync(resolve(root, "src/pages/Auth.tsx"), "utf8");
const provisionerSource = readFileSync(
  resolve(root, "supabase/functions/provision-commercial-accounts/index.ts"),
  "utf8",
);
const cleanupMigration = readFileSync(
  resolve(root, "supabase/migrations/20260710185500_remove_commercial_demo_accounts.sql"),
  "utf8",
);

describe("commercial account provisioning", () => {
  it("keeps all simulated commercial logins disabled", () => {
    expect(COMMERCIAL_DEMO_LOGINS).toEqual([]);
    expect(getCommercialDemoLogin("commercial01")).toBeNull();
    expect(getCommercialDemoLogin("commercial10")).toBeNull();
    expect(authSource).not.toContain('email: "commercial01@demo.thetok.ch"');
  });

  it("removes the legacy simulation users and their generated business data", () => {
    expect(cleanupMigration).toContain("commercial(0[1-9]|10)@demo\\.thetok\\.ch");
    expect(cleanupMigration).toContain("DELETE FROM public.commercial_prospect_followups");
    expect(cleanupMigration).toContain("DELETE FROM public.restaurants");
    expect(cleanupMigration).toContain("DELETE FROM auth.users");
  });

  it("creates real commercial accounts only through an authenticated admin handler", () => {
    expect(provisionerSource).toContain('if (!authHeader.startsWith("Bearer "))');
    expect(provisionerSource).toContain("callerClient.auth.getUser()");
    expect(provisionerSource).toContain('.from("user_roles")');
    expect(provisionerSource).toContain('String(row.role) === "admin"');
    expect(provisionerSource).toContain("admin.auth.admin.createUser");
    expect(provisionerSource).toContain("admin.auth.admin.updateUserById");
    expect(provisionerSource).toContain('role: "commercial"');
    expect(provisionerSource).toContain("accounts.length < 1 || accounts.length > 20");
  });

  it("does not embed commercial passwords or fixed production identities in source control", () => {
    expect(provisionerSource).not.toMatch(/Matbanana93|Patsurf06|Bullshit34|Quirinale1|abdelcrossroad/i);
    expect(provisionerSource).not.toMatch(/@(commercial\.)?thetok\.ch/);
  });
});
