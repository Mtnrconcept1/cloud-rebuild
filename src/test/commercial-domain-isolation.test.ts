import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The focused workspace snapshot does not include the unrelated roleAccess
// module. Keep this suite scoped to commercial post-login routing.
vi.mock("@/lib/roleAccess", () => ({
  getRoleHomePath: (role: string) => ({
    admin: "/admin",
    restaurateur: "/dashboard",
    courier: "/courier",
    commercial: "/commercial",
    client: "/mon-espace",
  })[role] || "/",
}));

import {
  TOK_COMMERCIAL_APP_ORIGIN,
  canOperateCommercialDemoHost,
  getCommercialHostRedirectTarget,
  getCommercialNavigationHref,
  getCommercialReauthenticationHref,
  isCommercialAppHost,
  isCommercialDemoFrameHostPath,
  isCommercialHostPathAllowed,
  isCommercialNamespacePath,
  isManagedCommercialAccount,
  isOwnedTokPreviewHost,
} from "@/lib/commercialDomains";
import { getPostAuthTargetForRole } from "@/lib/authPostLogin";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const framePath = `/commercial/demo-live/frame/client/${sessionId}/mon-espace`;

describe("commercial.thetok.ch canonical isolation", () => {
  it("matches only the exact commercial hostname", () => {
    expect(isCommercialAppHost("commercial.thetok.ch")).toBe(true);
    expect(isCommercialAppHost("COMMERCIAL.THETOK.CH.")).toBe(true);
    expect(isCommercialAppHost("commercial.thetok.ch.evil.example")).toBe(false);
    expect(isCommercialAppHost("notcommercial.thetok.ch")).toBe(false);
  });

  it("allows only login, commercial workspaces and strictly shaped demo frames", () => {
    for (const path of [
      "/auth",
      "/auth/callback",
      "/commercial",
      "/commercial/prospection",
      "/commercial/comptabilite",
      "/commercial/demo-live",
      framePath,
      `/commercial/demo-live/frame/restaurant/${sessionId}/dashboard/commandes`,
      `/commercial/demo-live/frame/courier/${sessionId}/courier/jobs`,
      `/commercial/demo-live/frame/commercial/${sessionId}/commercial`,
    ]) {
      expect(isCommercialHostPathAllowed(path), path).toBe(true);
    }

    for (const path of [
      "/",
      "/recherche",
      "/restaurants/geneve",
      "/restaurant/production-id",
      "/dashboard",
      "/courier",
      "/admin",
      "/commercial/demo-live/evil",
      "/commercial/demo-live/frame/client/not-a-uuid/mon-espace",
      `/commercial/demo-live/frame/admin/${sessionId}/admin`,
    ]) {
      expect(isCommercialHostPathAllowed(path), path).toBe(false);
    }

    expect(isCommercialDemoFrameHostPath(framePath)).toBe(true);
    expect(isCommercialDemoFrameHostPath(`${framePath}-suffix`)).toBe(true);
  });

  it("canonicalizes commercial routes before authentication and preserves query/hash", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/commercial",
      search: "?tab=terrain",
      hash: "#today",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial?tab=terrain#today`);

    expect(getCommercialHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/commercial/comptabilite",
      search: "?month=2026-07",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial/comptabilite?month=2026-07`);

    expect(getCommercialHostRedirectTarget({
      hostname: "unrelated-preview.vercel.app",
      pathname: framePath,
      search: "?panel=client",
      hash: "#order",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}${framePath}?panel=client#order`);
  });

  it("keeps only owned Vercel previews same-origin", () => {
    const ownedPreview = "cloud-rebuild-recovered-qvfp8r7yn-mtnrconcepts-projects.vercel.app";
    expect(isOwnedTokPreviewHost(ownedPreview)).toBe(true);
    expect(isOwnedTokPreviewHost("unrelated-qvfp8r7yn-other-project.vercel.app")).toBe(false);
    expect(getCommercialHostRedirectTarget({
      hostname: ownedPreview,
      pathname: framePath,
    })).toBeNull();
    expect(getCommercialNavigationHref("/commercial/demo-live", ownedPreview))
      .toBe("/commercial/demo-live");
    expect(getCommercialHostRedirectTarget({
      hostname: ownedPreview,
      pathname: "/restaurants/geneve",
      authResolved: true,
      isAuthenticated: true,
      roles: ["commercial"],
    })).toBe("/commercial");
  });

  it("canonicalizes the complete commercial namespace without exposing invalid routes", () => {
    expect(isCommercialNamespacePath("/commercial/anything")).toBe(true);
    expect(isCommercialNamespacePath("/commercially")).toBe(false);
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/commercial/",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
    expect(getCommercialHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/commercial/demo-live/",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial/demo-live`);
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/commercial/route-inconnue",
      search: "?code=must-not-cross",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
  });

  it("moves commercial login intent before credentials but keeps PKCE callbacks on-origin", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/auth",
      search: "?redirect=%2Fcommercial%2Fdemo-live",
    })).toBe(
      `${TOK_COMMERCIAL_APP_ORIGIN}/auth?redirect=%2Fcommercial%2Fdemo-live&domain=required`,
    );
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/auth",
      search: "?domain=required&redirect=https%3A%2F%2Fevil.example%2Fcommercial",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/auth?redirect=%2Fcommercial&domain=required`);
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/auth",
      search: "?code=pkce-code&redirect=%2Fcommercial",
    })).toBeNull();
  });

  it("never forwards Supabase callback credentials across origins", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/commercial",
      search: "?code=secret-pkce&access_token=query-jwt&refresh_token=query-refresh&tab=terrain",
      hash: "#access_token=secret-jwt&refresh_token=secret-refresh",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial?tab=terrain`);

    const reauthenticationHref = getCommercialReauthenticationHref(
      `${TOK_COMMERCIAL_APP_ORIGIN}/commercial?code=pkce-secret&tab=terrain#access_token=jwt-secret`,
    );
    expect(reauthenticationHref).toBe(
      `${TOK_COMMERCIAL_APP_ORIGIN}/auth?redirect=%2Fcommercial%3Ftab%3Dterrain&domain=required`,
    );
    expect(reauthenticationHref).not.toContain("pkce-secret");
    expect(reauthenticationHref).not.toContain("jwt-secret");
  });

  it("moves a managed commercial away from every public production surface", () => {
    expect(isManagedCommercialAccount(["client", "restaurateur", "commercial"])).toBe(true);
    expect(canOperateCommercialDemoHost(["commercial"])).toBe(true);
    expect(getCommercialHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/restaurants/geneve",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "client",
      roles: ["client", "restaurateur", "commercial"],
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
  });

  it("keeps unmarked administrators operational while durable demo markers stay confined", () => {
    expect(isManagedCommercialAccount(["admin", "commercial"])).toBe(false);
    expect(isManagedCommercialAccount(["admin", "commercial"], "commercial_demo")).toBe(true);
    expect(isManagedCommercialAccount(["admin", "commercial"], null, true)).toBe(true);
    expect(canOperateCommercialDemoHost(["admin"])).toBe(true);

    expect(getCommercialHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/admin",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "admin",
      roles: ["admin", "client", "commercial", "courier", "restaurateur"],
    })).toBeNull();

    expect(getCommercialHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/admin",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "admin",
      roles: ["admin", "commercial"],
      accountType: "commercial_demo",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);

    expect(getCommercialHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/admin",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "admin",
      roles: ["admin", "commercial"],
      hasCommercialDemoMapping: true,
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);

    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/commercial/demo-live",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "admin",
      roles: ["admin"],
    })).toBeNull();
  });

  it("blocks invalid paths before they can render on the commercial host", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/recherche",
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);

    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/restaurant/real-id",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "commercial",
      roles: ["client", "restaurateur", "commercial"],
    })).toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
  });

  it("evicts authenticated non-commercial accounts to their canonical host", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/commercial",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "client",
      roles: ["client"],
    })).toBe("https://www.thetok.ch/mon-espace");

    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/commercial/demo-live",
      authResolved: true,
      isAuthenticated: true,
      activeRole: "restaurateur",
      roles: ["restaurateur"],
    })).toBe("https://www.thetok.ch/dashboard");
  });

  it("preserves auth callbacks on the commercial host and local development", () => {
    expect(getCommercialHostRedirectTarget({
      hostname: "commercial.thetok.ch",
      pathname: "/auth/callback",
      search: "?code=pkce-code",
    })).toBeNull();
    expect(getCommercialHostRedirectTarget({
      hostname: "localhost",
      pathname: "/restaurants/geneve",
      authResolved: true,
      isAuthenticated: true,
      roles: ["commercial"],
    })).toBeNull();
    expect(getCommercialNavigationHref("/commercial/demo-live", "localhost"))
      .toBe("/commercial/demo-live");
  });

  it("uses canonical commercial URLs after login and keeps admin demo access", () => {
    expect(getPostAuthTargetForRole("commercial", null))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
    expect(getPostAuthTargetForRole("commercial", "/commercial/demo-live?panel=client"))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial/demo-live?panel=client`);
    expect(getPostAuthTargetForRole("admin", "/commercial/demo-live"))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial/demo-live`);
    expect(getPostAuthTargetForRole("admin", null, { isCommercialAuthHost: true }))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
    expect(getPostAuthTargetForRole("admin", "/admin", { isCommercialAuthHost: true }))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial`);
    expect(getPostAuthTargetForRole("admin", "/commercial/demo-live", { isCommercialAuthHost: true }))
      .toBe(`${TOK_COMMERCIAL_APP_ORIGIN}/commercial/demo-live`);
    expect(getPostAuthTargetForRole("client", "/commercial/demo-live"))
      .toBe("/mon-espace");
  });

  it("mounts the role-aware redirect boundary above every application route", () => {
    const root = process.cwd();
    const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
    const boundary = readFileSync(
      resolve(root, "src/components/commercial/CommercialHostBoundary.tsx"),
      "utf8",
    );
    const frameProvider = readFileSync(
      resolve(root, "src/components/commercial/CommercialDemoFrameProvider.tsx"),
      "utf8",
    );
    const roleSwitcher = readFileSync(
      resolve(root, "src/components/navigation/RoleSpaceSwitcher.tsx"),
      "utf8",
    );
    const roleMenu = readFileSync(
      resolve(root, "src/components/navigation/RoleSpaceMenuSection.tsx"),
      "utf8",
    );
    const auth = readFileSync(resolve(root, "src/pages/Auth.tsx"), "utf8");
    const mobileDomains = readFileSync(resolve(root, "src/lib/mobile-domains.ts"), "utf8");

    expect(app).toContain("<AuthProvider>\n                <CommercialHostBoundary>");
    expect(app.indexOf("<CommercialHostBoundary>"))
      .toBeLessThan(app.indexOf("{commercialDemoFrame ? ("));
    expect(boundary).toContain("buildSanitizedAuthRedirectUrl");
    expect(boundary).toContain('signOut({ scope: "local" })');
    expect(boundary).toContain("getCommercialReauthenticationHref");
    expect(boundary).toContain("redirectIsCrossOrigin");
    expect(boundary).toContain("accountType");
    expect(boundary).toContain("hasCommercialDemoMapping");
    expect(boundary).toContain("shouldWaitForRoleResolution");
    expect(boundary).toContain("if (shouldRedirect || shouldWaitForRoleResolution) return <LoadingCommercialRedirect />");
    expect(frameProvider).toContain("[...auth.roles, forcedRole]");
    expect(frameProvider).toContain("roles: presentationRoles");
    expect(roleSwitcher).toContain('getCommercialNavigationHref("/commercial")');
    expect(roleMenu).toContain('getCommercialNavigationHref("/commercial")');
    expect(auth).toContain("Connexion commerciale sécurisée");
    expect(auth).toContain("Aucun jeton de session n’est transféré");
    expect(mobileDomains).toContain("TOK_COMMERCIAL_APP_HOST");
  });
});
