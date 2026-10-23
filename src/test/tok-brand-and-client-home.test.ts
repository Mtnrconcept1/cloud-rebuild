import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK brand orange and client navigation", () => {
  it("uses the sampled #F15D22 brand orange in global tokens and dashboard styles", () => {
    const globalTheme = source("src/index.css");
    const dashboardTheme = source("src/components/dashboard/WorkspaceDesign.css");
    const tailwind = source("tailwind.config.ts");

    expect(globalTheme).toContain("--tok-brand-orange: #F15D22;");
    expect(globalTheme).toContain("--primary: 17.101449 88.085106% 53.921569%;");
    expect(dashboardTheme).toContain("--workspace-orange: var(--tok-brand-orange, #F15D22);");
    expect(dashboardTheme).toContain("--workspace-orange-strong: var(--tok-brand-orange, #F15D22);");
    expect(tailwind).toContain('const TOK_BRAND_ORANGE = "#F15D22";');
    expect(tailwind).toContain("500: TOK_BRAND_ORANGE,");
  });

  it("makes the real TOK logo a homepage link in the client toolbar, including mobile", () => {
    const layout = source("src/components/CustomerDashboardLayout.tsx");
    const dashboardTheme = source("src/components/dashboard/WorkspaceDesign.css");

    expect(layout).toContain('to="/" aria-label="TOK — Accueil du site" className="tok-client-toolbar-logo md:hidden"');
    expect(layout).toContain('<img src={logoSrc} alt="TOK" width={74} height={44}');
    expect(dashboardTheme).toContain(".tok-client-shell .tok-client-toolbar-logo {");
    expect(dashboardTheme).not.toContain('content: "Mon espace TOK"');
  });
});
