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

  it("keeps the restaurant illustration prominent from desktop to narrow mobile", () => {
    const component = readSource("src/components/dashboard/DashboardPageHero.tsx");
    const styles = readSource("src/components/dashboard/WorkspaceDesign.css");

    expect(component).toContain("data-has-illustration={Boolean(currentIllustration)}");
    expect(component).toContain("tok-hospitality-illustration-stage");
    expect(styles).toMatch(/\.tok-hospitality-summary-layout[^}]*minmax\(142px, \.9fr\)/);
    expect(styles).toMatch(/\.tok-hospitality-illustration-stage[^}]*overflow:\s*visible/);
    expect(styles).toMatch(/@media \(max-width: 920px\) and \(min-width: 768px\)[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(100px, 1fr\)\)/);
    expect(styles).toMatch(/@media \(max-width: 420px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 104px/);
    expect(styles).toMatch(/@media \(max-width: 420px\)[\s\S]*width:\s*104px[^}]*max-height:\s*126px/);
  });

  it("uses a crisp dedicated mobile photo band on both dashboard surfaces", () => {
    const styles = readSource("src/components/dashboard/WorkspaceDesign.css");
    const mobileStyles = styles.split("@media (max-width: 767px)")[1]?.split("@media (min-width: 640px)")[0] ?? "";

    expect(mobileStyles).toMatch(/\.tok-hospitality-hero-copy::before[^}]*height:\s*218px[^}]*saturate\(1\.12\) contrast\(1\.04\)/);
    expect(mobileStyles).toMatch(/\.tok-customer-page-hero::before[^}]*height:\s*218px[^}]*saturate\(1\.12\) contrast\(1\.04\)/);
    expect(mobileStyles).toMatch(/\.tok-hospitality-hero-copy::after[^}]*0%\) 38%[^}]*96%\) 56%[^}]*100%\) 64%/);
    expect(mobileStyles).toMatch(/\.tok-customer-page-hero::after[^}]*0%\) 38%[^}]*96%\) 56%[^}]*100%\) 64%/);
  });
});
