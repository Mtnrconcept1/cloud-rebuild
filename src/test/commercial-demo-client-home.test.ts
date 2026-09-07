import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo real client dashboard home", () => {
  const clientHome = read("src/pages/ClientDashboardHome.tsx");
  const clientRoutes = read("src/lib/commercialDemoClientRoutes.ts");
  const clientLayout = read("src/components/CustomerDashboardLayout.tsx");
  const notifications = read("src/hooks/useNotificationCenter.ts");

  it("renders the exact production client home component in the embedded client frame", () => {
    expect(clientHome).toContain("function LiveClientDashboardHome()");
    expect(clientHome).toContain("return <LiveClientDashboardHome />");
    expect(clientHome).toContain("Vos prochaines actions, vos avantages et toute votre activité en un seul endroit.");
    expect(clientHome).toContain("Accès rapides");
    expect(clientHome).not.toContain("CommercialDemoActorOverview");
  });

  it("builds the client overview from the validated demo snapshot without running production client queries", () => {
    expect(clientHome).toContain("commercialDemoFrame.snapshot.order");
    expect(clientHome).toContain("useFeatureFlagSnapshot({ enabled: !isCommercialDemoClientFrame })");
    expect(clientHome).toContain("demoOrder?.customer_name");
    expect(clientHome).toContain("demoOrder.total_amount_cents / 100");
    expect(clientHome).toContain("enabled: Boolean(!isCommercialDemoClientFrame");
    expect(clientHome).toContain("const overviewData = isCommercialDemoClientFrame ? demoOverviewData : overviewQuery.data");
    expect(notifications).toContain("enabled: Boolean(user?.id && !isCommercialDemoFrame)");
    expect(notifications).toContain("commercialDemoFrame.snapshot.events");
  });

  it("keeps every client-home link inside the isolated frame allowlist", () => {
    expect(clientHome).toContain("function getClientDashboardHomeTarget");
    expect(clientHome).toContain("return getCommercialDemoClientTarget(target)");
    expect(clientRoutes).toContain('"/commande/"');
    expect(clientRoutes).not.toContain('if (url.pathname.startsWith("/commande/")) return "/commandes";');
    expect(clientRoutes).toContain("isCommercialDemoClientPathAllowed(url.pathname)");
    expect(clientRoutes).toContain('return "/recherche";');
    expect(clientHome).toContain("to={clientTarget(action.to)}");
    expect(clientHome).toContain('to={clientTarget(`/commande/');
  });

  it("hides both sign-out controls while the shared commercial session is embedded", () => {
    expect(clientLayout.match(/!commercialDemoFrame \? \(/g)).toHaveLength(2);
    expect(clientLayout.match(/<SignOutButton/g)).toHaveLength(2);
  });
});
