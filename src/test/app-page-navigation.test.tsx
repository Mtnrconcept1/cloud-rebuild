import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { InternalLinkNavigation } from "@/components/navigation/AppPageNavigation";
import { getInternalPageTarget, getPageSwipeDirection } from "@/lib/internalPageNavigation";

const current = "https://www.thetok.ch/recherche";

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-test-anchor]").forEach((anchor) => anchor.remove());
});

describe("internal page navigation", () => {
  it("routes in-app paths without reloading a prerendered document", () => {
    expect(getInternalPageTarget("/restaurants/geneve?q=brunch", current)).toBe("/restaurants/geneve?q=brunch");
    expect(getInternalPageTarget("https://www.thetok.ch/restaurant/123#menu", current)).toBe("/restaurant/123#menu");
  });

  it("leaves external links, files, callbacks and hash navigation to the browser", () => {
    expect(getInternalPageTarget("https://other.example/path", current)).toBeNull();
    expect(getInternalPageTarget("https://thetok.ch/recherche", current)).toBeNull();
    expect(getInternalPageTarget("/assets/app.js", current)).toBeNull();
    expect(getInternalPageTarget("/menu.pdf", current)).toBeNull();
    expect(getInternalPageTarget("/api/status", current)).toBeNull();
    expect(getInternalPageTarget("/auth/callback?code=123", current)).toBeNull();
    expect(getInternalPageTarget("/recherche#cuisines", current)).toBeNull();
    expect(getInternalPageTarget("javascript:alert(1)", current)).toBeNull();
  });

  it("intercepts an ordinary same-origin anchor after React Router gets first refusal", async () => {
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="app-path">{location.pathname}{location.search}</output>;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <InternalLinkNavigation />
        <LocationProbe />
      </MemoryRouter>,
    );

    const anchor = document.createElement("a");
    anchor.href = `${window.location.origin}/recherche?q=sushi`;
    anchor.setAttribute("data-test-anchor", "true");
    anchor.textContent = "Rechercher";
    document.body.appendChild(anchor);
    fireEvent.click(anchor);

    await waitFor(() => expect(screen.getByTestId("app-path").textContent).toBe("/recherche?q=sushi"));
  });

  it("keeps the outgoing page scroll until the new route appears", () => {
    const transition = readFileSync("src/components/navigation/AppPageNavigation.tsx", "utf8");
    const scroll = readFileSync("src/components/ScrollToTop.tsx", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");

    expect(transition).toContain("<ScrollToTop locationOverride={routeLocation} />");
    expect(scroll).toContain("locationOverride ?? currentLocation");
    expect(app).toContain("<PageSwipeTransition routeKey={pathname} routeLocation={location}>");
    expect(app).not.toContain('<ScrollToTop />\n              <RouteSeoFallback />');
  });

  it("reverses the swipe on browser history navigation", () => {
    expect(getPageSwipeDirection("PUSH")).toBe(1);
    expect(getPageSwipeDirection("REPLACE")).toBe(1);
    expect(getPageSwipeDirection("POP")).toBe(-1);
  });
});

describe("SEO prerender handoff", () => {
  it("prevents the SEO text flash without removing crawlable HTML", () => {
    const html = readFileSync("index.html", "utf8");
    const headScript = readFileSync("public/theme-preference-init.js", "utf8");
    const bootCss = readFileSync("public/tok-app-boot.css", "utf8");
    const prerender = readFileSync("scripts/prerender-seo.mjs", "utf8");

    expect(html).toContain('href="/tok-app-boot.css"');
    expect(html.indexOf('href="/tok-app-boot.css"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(headScript).toContain('classList.add("tok-app-booting")');
    expect(bootCss).toContain("html.tok-app-booting #root > #tok-prerendered-content");
    expect(bootCss).toContain("prefers-reduced-motion: reduce");
    expect(prerender).toContain('`<div id="root">${renderStaticContent(page)}</div>`');
    expect(prerender).toContain('id="tok-prerendered-content"');
  });
});
