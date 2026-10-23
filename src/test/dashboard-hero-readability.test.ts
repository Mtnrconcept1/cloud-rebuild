import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const readSource = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("dashboard hero readability", () => {
  it("uses the shared readable description style on restaurant heroes", () => {
    const component = readSource("src/components/dashboard/DashboardPageHero.tsx");
    const styles = readSource("src/components/dashboard/WorkspaceDesign.css");

    expect(component).toContain("tok-dashboard-hero-description");
    expect(styles).toMatch(/\.tok-dashboard-hero-description[^}]*font-size:\s*clamp\(16px/);
    expect(styles).toMatch(/\.tok-dashboard-hero-description[^}]*max-width:\s*min\(64%/);
  });

  it("keeps customer hero descriptions readable on desktop and mobile", () => {
    const styles = readSource("src/components/dashboard/CustomerWorkspacePages.css");

    expect(styles).toMatch(/\.tok-customer-page-hero__description[^}]*font-size:\s*clamp\(16px/);
    expect(styles).toMatch(/\.tok-customer-page-hero__description[^}]*font-size:\s*16px/);
    expect(styles).toMatch(/\.tok-customer-page-hero__eyebrow[^}]*font-size:\s*11px/);
  });

  it("protects copy from photography with an opaque reading gradient", () => {
    const styles = readSource("src/components/dashboard/WorkspaceDesign.css");

    expect(styles).toMatch(/\.tok-hospitality-hero-copy::after[^}]*99%\) 42%[^}]*92%\) 58%/);
    expect(styles).toMatch(/\.tok-customer-page-hero::after[^}]*99%\) 42%[^}]*92%\) 58%/);
  });
});
