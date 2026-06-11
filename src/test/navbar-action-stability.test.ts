import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("navbar action stability", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");
  const notificationBell = readFileSync(resolve(process.cwd(), "src/components/notifications/NotificationBell.tsx"), "utf8");

  it("prevents mouse focus from scrolling the sticky desktop action bar", () => {
    expect(source).toContain("preserveNavbarActionScrollPosition");
    expect(source).toContain("event.detail === 0");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("window.scrollTo(scrollX, scrollY)");
    expect(source).toContain("onMouseDown={preserveNavbarActionScrollPosition}");
    expect(source).toContain('aria-label="Mode sombre"');
    expect(notificationBell).toContain("aria-label={`Notifications");
    expect(source).toContain('aria-label={hasDashboardAccess ? "Ouvrir mes espaces" : "Compte"}');
  });

  it("keeps desktop dropdown actions non-modal so scroll locking does not move the sticky header", () => {
    expect(source).toContain("NotificationBell");
    expect(notificationBell).toContain("<DropdownMenu modal={false}>");
    expect(source).toContain("<DropdownMenu modal={false} open={accountMenuOpen}");
    expect(source).toContain("setAccountMenuOpen(open)");
    expect(source).toContain("data-[state=closed]:hidden");
  });

  it("keeps flash sales visibly distinct in desktop and mobile navigation", () => {
    expect(source).toContain("Zap,");
    expect(source).toContain('<Zap className="h-4 w-4 fill-amber-400/35 text-amber-500 dark:text-amber-300" />');
    expect(source).toContain("text-amber-600 transition-colors hover:text-orange-600");
    expect(source).toContain("text-amber-600 hover:text-orange-600");
  });

  it("keeps the desktop actualites tab immediately after explorer", () => {
    const desktopNavigationStart = source.indexOf('<NavigationMenu className="hidden lg:flex">');
    const explorerIndex = source.indexOf('to="/recherche" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"', desktopNavigationStart);
    const actualitesIndex = source.indexOf('to="/actualites" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"', desktopNavigationStart);
    const antiWasteIndex = source.indexOf('to="/anti-gaspi" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-accent transition-colors hover:text-accent/80"', desktopNavigationStart);

    expect(desktopNavigationStart).toBeGreaterThan(-1);
    expect(explorerIndex).toBeGreaterThan(desktopNavigationStart);
    expect(actualitesIndex).toBeGreaterThan(explorerIndex);
    expect(antiWasteIndex).toBeGreaterThan(actualitesIndex);
  });

  it("keeps the compact menu available through tablet widths before desktop navigation", () => {
    expect(source).toContain('<NavigationMenu className="hidden lg:flex">');
    expect(source).toContain('className="hidden h-20 w-20 lg:flex"');
    expect(source).toContain("lg:hidden");
    expect(source).not.toContain('<NavigationMenu className="hidden md:flex">');
  });

  it("keeps the desktop Help button to the right of the account spaces CTA", () => {
    const accountMenuIndex = source.indexOf('<DropdownMenu modal={false} open={accountMenuOpen}');
    const compactHelpIndex = source.indexOf('<ChefHelpButton surface="client" compact className="hidden h-20 w-20 lg:flex" />');

    expect(accountMenuIndex).toBeGreaterThan(-1);
    expect(compactHelpIndex).toBeGreaterThan(accountMenuIndex);
  });

  it("keeps the desktop restaurants tab beside the notification actions", () => {
    const notificationIndex = source.indexOf("<NotificationBell");
    const restaurantsActionIndex = source.indexOf('className="hidden h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:inline-flex"');
    const accountMenuIndex = source.indexOf('<DropdownMenu modal={false} open={accountMenuOpen}');

    expect(notificationIndex).toBeGreaterThan(-1);
    expect(restaurantsActionIndex).toBeGreaterThan(notificationIndex);
    expect(accountMenuIndex).toBeGreaterThan(restaurantsActionIndex);
  });
});
