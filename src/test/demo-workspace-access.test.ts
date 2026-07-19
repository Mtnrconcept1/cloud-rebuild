import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEMO_WORKSPACES,
  getDemoMultiWorkspaceHref,
  getDemoMultiWorkspacePath,
  getDemoWorkspaceHref,
  getDemoWorkspacePath,
  isDemoWorkspaceSurface,
} from "@/lib/demoWorkspaces";

const roleMenu = readFileSync("src/components/navigation/RoleSpaceMenuSection.tsx", "utf8");
const roleSwitcher = readFileSync("src/components/navigation/RoleSpaceSwitcher.tsx", "utf8");
const browserGrid = readFileSync("src/components/commercial/CommercialDemoBrowserGrid.tsx", "utf8");
const demoExperience = readFileSync("src/components/commercial/CommercialMultiSpaceDemo.tsx", "utf8");
const singleDemo = readFileSync("src/components/commercial/CommercialSingleSpaceDemo.tsx", "utf8");
const demoPage = readFileSync("src/pages/CommercialDemoLive.tsx", "utf8");
const auth = readFileSync("src/lib/auth.tsx", "utf8");
const demoClient = readFileSync("src/integrations/supabase/demoClient.ts", "utf8");
const authStorage = readFileSync("src/integrations/supabase/authStorage.ts", "utf8");
const signOutButton = readFileSync("src/components/auth/SignOutButton.tsx", "utf8");
const workspaceChooser = readFileSync("src/pages/WorkspaceChooser.tsx", "utf8");
const productionMigration = readFileSync(
  "supabase/migrations/20260719165000_enforce_commercial_only_roles.sql",
  "utf8",
);
const demoMigration = readFileSync(
  "supabase/demo-migrations/20260719165000_enforce_commercial_only_roles.sql",
  "utf8",
);
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  redirects?: Array<{
    has?: Array<{ type?: string; value?: string }>;
    destination?: string;
  }>;
};

describe("real and demo workspace access", () => {
  it("exposes the three isolated demo dashboard entry points", () => {
    expect(DEMO_WORKSPACES.map((workspace) => workspace.hostname)).toEqual([
      "demo-client.thetok.ch",
      "demo-restaurateur.thetok.ch",
      "demo-livreur.thetok.ch",
    ]);
    expect(getDemoWorkspaceHref("client", "admin.thetok.ch"))
      .toBe("https://demo-client.thetok.ch/");
    expect(getDemoWorkspaceHref("restaurant", "commercial.thetok.ch"))
      .toBe("https://demo-restaurateur.thetok.ch/");
    expect(getDemoWorkspaceHref("courier", "localhost"))
      .toBe("/commercial/demo-live?surface=courier");
    expect(getDemoWorkspacePath("restaurant"))
      .toBe("/commercial/demo-live?surface=restaurant");
    expect(getDemoMultiWorkspaceHref("admin.thetok.ch"))
      .toBe("https://commercial.thetok.ch/commercial/demo-live");
    expect(getDemoMultiWorkspacePath()).toBe("/commercial/demo-live");
    expect(isDemoWorkspaceSurface("courier")).toBe(true);
    expect(isDemoWorkspaceSurface("admin")).toBe(false);
  });

  it("gives admins explicit real/demo buttons and commercials only their allowed surfaces", () => {
    for (const source of [roleMenu, roleSwitcher]) {
      expect(source).toContain("Accès réel");
      expect(source).toContain("Accès démo");
      expect(source).toContain("DEMO_WORKSPACES.map");
    }
    expect(roleMenu).toContain("const commercialOnly = isCommercial && !isAdmin");
    expect(roleMenu).toContain('commercialOnly ? renderRealRole("commercial") : null');
    expect(roleMenu).toContain('label: "Espace commercial"');
    expect(roleMenu).not.toContain('roles.includes("client") || roles.includes("commercial")');
  });

  it("opens requested demo dashboards in a unique view and keeps multi-dashboard explicit", () => {
    expect(demoPage).toContain("isDemoWorkspaceSurface(requestedSurface)");
    expect(demoPage).toContain("<CommercialSingleSpaceDemo surface={requestedSurface} />");
    expect(demoPage).toContain("<CommercialMultiSpaceDemo />");
    expect(singleDemo).toContain("buildCommercialDemoFrameUrl");
    expect(singleDemo).toContain("SURFACE_HOME");
    expect(singleDemo).toContain("Vue multi-dashboard");
    expect(singleDemo).toContain("commercial-demo-single-frame");
    expect(browserGrid).toContain('() => ["client", "restaurant", "courier"]');
    expect(demoExperience).toContain("<CommercialDemoBrowserGrid");
  });

  it("keeps persisted commercial roles singular while preserving the legacy client fallback", () => {
    expect(auth).toContain("const resolvedRoles = new Set<UserRole>();");
    expect(auth).toContain("if (resolvedRoles.size > 0)");
    expect(auth).toContain("if (resolvedRoles.size === 0)");
    expect(auth).not.toContain('new Set<UserRole>(["client"])');

    for (const migration of [productionMigration, demoMigration]) {
      expect(migration).toContain("commercial.role = 'commercial'");
      expect(migration).toContain("administrator.role = 'admin'");
      expect(migration).toContain("assigned.role <> 'commercial'");
    }
  });

  it("redirects each demo subdomain to its focused commercial demo surface", () => {
    const redirects = new Map(
      (vercelConfig.redirects || []).map((redirect) => [
        redirect.has?.find((condition) => condition.type === "host")?.value,
        redirect.destination,
      ]),
    );

    expect(redirects.get("demo-client.thetok.ch"))
      .toBe("/commercial/demo-live?surface=client");
    expect(redirects.get("demo-restaurateur.thetok.ch"))
      .toBe("/commercial/demo-live?surface=restaurant");
    expect(redirects.get("demo-livreur.thetok.ch"))
      .toBe("/commercial/demo-live?surface=courier");
  });

  it("uses one canonical login, a shared TOK session and a role-aware chooser", () => {
    expect(authStorage).toContain('SHARED_AUTH_COOKIE_DOMAIN = ".thetok.ch"');
    expect(authStorage).toContain("SameSite=Lax; Secure");
    expect(authStorage).toContain("Seamlessly migrate sessions");
    expect(signOutButton).toContain("window.location.replace(getCanonicalAuthHref())");
    expect(workspaceChooser).toContain("Choisissez votre espace");
    expect(workspaceChooser).toContain("canAccessDemo");
    expect(workspaceChooser).toContain("DEMO_WORKSPACES.map");
  });

  it("selects the demo Supabase client for nested dashboard frame routes", () => {
    expect(demoClient).toContain("[0-9a-f-]{36}(?:\\/|$)");
    expect(demoClient).not.toContain("[0-9a-f-]{36}\\/?$");
  });
});
