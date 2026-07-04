import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMERCIAL_DEMO_LOGINS, getCommercialDemoLogin } from "@/lib/commercialDemoLogins";

const root = process.cwd();
const functionSource = readFileSync(
  resolve(root, "supabase/functions/provision-commercial-demo-logins/index.ts"),
  "utf8",
);
const scriptSource = readFileSync(
  resolve(root, "scripts/provision-commercial-demo-logins.mjs"),
  "utf8",
);
const docsSource = readFileSync(
  resolve(root, "docs/commercial-demo-logins.md"),
  "utf8",
);

describe("commercial demo login provisioning", () => {
  it("defines ten unique commercial demo accounts with matching username and code", () => {
    const accounts = [...functionSource.matchAll(/username: "([^"]+)",\s+password: "([^"]+)"/g)]
      .map((match) => ({ username: match[1], password: match[2] }));

    expect(accounts).toHaveLength(10);
    expect(COMMERCIAL_DEMO_LOGINS).toHaveLength(10);
    expect(new Set(accounts.map((account) => account.username)).size).toBe(10);

    for (const account of accounts) {
      expect(account.password).toBe(account.username);
      expect(docsSource).toContain(`\`${account.username}\``);
      expect(docsSource).toContain(`\`${account.username}@demo.thetok.ch\``);
      expect(getCommercialDemoLogin(account.username)).toEqual(
        expect.objectContaining({
          username: account.username,
          email: `${account.username}@demo.thetok.ch`,
        }),
      );
    }
  });

  it("grants each commercial login access to commercial, client and restaurateur spaces", () => {
    expect(functionSource).toContain('const DEMO_ROLES = ["client", "restaurateur", "commercial"] as const');
    expect(functionSource).toContain("DEMO_ROLES.map((role) => ({ user_id: userId, role }))");
  });

  it("creates complete restaurant demo environments for every account", () => {
    expect(functionSource).toContain('.from("restaurants")');
    expect(functionSource).toContain('.from("restaurant_branches")');
    expect(functionSource).toContain('.from("restaurant_hours")');
    expect(functionSource).toContain('.from("reservation_tables")');
    expect(functionSource).toContain('.from("menu_items")');
    expect(functionSource).toContain('.from("restaurant_media")');
    expect(functionSource).toContain("opening_hours: openingHours()");
    expect(functionSource).toContain("service_settings");
  });

  it("keeps Auth user creation server-side and limits public bootstrap to demo usernames", () => {
    expect(functionSource).toContain("auth.admin.createUser");
    expect(functionSource).toContain("auth.admin.updateUserById");
    expect(functionSource).toContain("findCommercialDemoAccount(body?.username)");
    expect(functionSource).toContain("body?.demo_login === true");
    expect(functionSource).toContain('action: "prepare_public_login"');
    expect(functionSource).toContain("authenticateRequest(req, { allowServiceRole: true })");
    expect(functionSource).toContain('requireRole(actor, ["admin"])');
    expect(scriptSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(scriptSource).not.toMatch(/sk-[a-zA-Z0-9_-]{20,}|sbp_[a-zA-Z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}/);
  });
});
