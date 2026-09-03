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
    expect(source).toContain('aria-label="Compte"');
    expect(source).not.toContain("Ouvrir mes espaces");
  });

  it("keeps desktop dropdown actions non-modal so scroll locking does not move the sticky header", () => {
    expect(source).toContain("NotificationBell");
    expect(notificationBell).toContain("<DropdownMenu modal={false}>");
    expect(source).toContain("<DropdownMenu modal={false} open={accountMenuOpen}");
    expect(source).toContain("setAccountMenuOpen(open)");
    expect(source).toContain("data-[state=closed]:hidden");
  });

  it("fades the header out on downward scroll and back in on upward scroll", () => {
    expect(source).toContain("const [isHeaderVisible, setIsHeaderVisible] = useState(true)");
    expect(source).toContain("window.addEventListener(\"scroll\", handleScroll, { passive: true })");
    expect(source).toContain("currentScrollY < 48 || scrollDelta < 0");
    expect(source).toContain("scrollDelta > 0 && !menuOpen && !accountMenuOpen");
    expect(source).toContain('transition-[opacity,transform] duration-300 ease-out');
    expect(source).toContain('isHeaderVisible ? "" : "pointer-events-none"');
    expect(source).toContain("opacity: isHeaderVisible ? 1 : 0");
    expect(source).toContain('transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)"');
  });

  it("publishes the visible public navbar height for page-level sticky controls", () => {
    expect(source).toContain("const headerRef = useRef<HTMLElement | null>(null)");
    expect(source).toContain("useLayoutEffect(() => {");
    expect(source).toContain("getBoundingClientRect().height");
    expect(source).toContain('root.style.setProperty("--tok-public-navbar-offset"');
    expect(source).toContain('root.style.removeProperty("--tok-public-navbar-offset")');
    expect(source).toContain("ref={headerRef}");
  });

  it("keeps flash sales visibly distinct in desktop and mobile navigation", () => {
    expect(source).toContain("Zap,");
    expect(source).toContain('<Zap className="h-4 w-4 fill-amber-400/40 text-amber-500 dark:text-amber-300" />');
    // Desktop tabs share navLinkClass(); flash sales keeps its amber override.
    expect(source).toContain('navLinkClass(location.pathname === "/ventes-flash"), "text-amber-700');
    expect(source).toContain("text-amber-600 hover:text-orange-600");
  });

  it("keeps the desktop actualites tab immediately after explorer", () => {
    const desktopNavigationStart = source.indexOf('<NavigationMenu className="hidden xl:flex">');
    const explorerIndex = source.indexOf('to="/recherche" className={navLinkClass(', desktopNavigationStart);
    const actualitesIndex = source.indexOf('to="/actualites" className={navLinkClass(', desktopNavigationStart);
    const antiWasteIndex = source.indexOf('to="/anti-gaspi" className={cn(navLinkClass(', desktopNavigationStart);

    expect(desktopNavigationStart).toBeGreaterThan(-1);
    expect(explorerIndex).toBeGreaterThan(desktopNavigationStart);
    expect(actualitesIndex).toBeGreaterThan(explorerIndex);
    expect(antiWasteIndex).toBeGreaterThan(actualitesIndex);
  });

  it("keeps the compact menu available through tablet widths before desktop navigation", () => {
    expect(source).toContain('<NavigationMenu className="hidden xl:flex">');
    expect(source).toContain('className="hidden h-20 w-20 xl:flex"');
    expect(source).toContain("xl:hidden");
    expect(source).not.toContain('<NavigationMenu className="hidden md:flex">');
  });

  it("keeps the desktop Help button to the right of the account menu", () => {
    const accountMenuIndex = source.indexOf('<DropdownMenu modal={false} open={accountMenuOpen}');
    const compactHelpIndex = source.indexOf('<ChefHelpButton surface="client" compact className="hidden h-20 w-20 xl:flex" />');

    expect(accountMenuIndex).toBeGreaterThan(-1);
    expect(compactHelpIndex).toBeGreaterThan(accountMenuIndex);
  });

  it("keeps the desktop restaurants tab beside the notification actions", () => {
    const notificationIndex = source.indexOf("<NotificationBell");
    const restaurantsActionIndex = source.indexOf('className="hidden h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-muted-foreground transition-colors duration-fast ease-out-soft hover:bg-muted hover:text-foreground xl:inline-flex"');
    const accountMenuIndex = source.indexOf('<DropdownMenu modal={false} open={accountMenuOpen}');

    expect(notificationIndex).toBeGreaterThan(-1);
    expect(restaurantsActionIndex).toBeGreaterThan(notificationIndex);
    expect(accountMenuIndex).toBeGreaterThan(restaurantsActionIndex);
  });
});
