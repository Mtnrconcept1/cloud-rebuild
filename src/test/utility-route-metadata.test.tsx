import { cleanup, render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureSeoMetadataForRoute } from "@/hooks/useSeoMeta";
import ComingSoon from "@/pages/ComingSoon";

function content(selector: string) {
  return document.head.querySelector(selector)?.getAttribute("content");
}

function canonical() {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  document.head.innerHTML = "";
  delete document.head.dataset.tokSeoOwner;
  delete document.head.dataset.tokSeoPath;
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("utility route metadata", () => {
  it("replaces stale 404 metadata with the coming-soon page metadata and keeps it out of search", () => {
    window.history.replaceState(null, "", "/coming-soon");
    document.head.innerHTML = '<title>Page introuvable | TOK</title><meta name="description" content="Cette page est introuvable"><link rel="canonical" href="https://www.thetok.ch/coming-soon"><script id="tok-page-json-ld" type="application/ld+json">{"@type":"Restaurant"}</script>';

    render(<BrowserRouter><ComingSoon /></BrowserRouter>);
    // The route-level fallback must not overwrite the page's own metadata.
    ensureSeoMetadataForRoute("/coming-soon");

    expect(document.title).toBe("Ouverture prochaine | TOK");
    expect(content('meta[name="description"]')).toBe("L'ouverture de TOK est imminente. Connectez-vous ou créez votre compte restaurateur.");
    expect(content('meta[name="robots"]')).toBe("noindex,nofollow,noarchive");
    expect(canonical()).toBe("https://www.thetok.ch/coming-soon");
    expect(content('meta[property="og:title"]')).toBe(document.title);
    expect(content('meta[name="twitter:title"]')).toBe(document.title);
    expect(content('meta[property="og:url"]')).toBe(canonical());
    expect(document.getElementById("tok-page-json-ld")).toBeNull();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/auth", "/auth"]);
  });

  it.each(["/parametres", "/parametres/securite", "/parametres/securite/"])("uses private metadata on %s", (path) => {
    window.history.replaceState(null, "", path);
    ensureSeoMetadataForRoute(path);

    expect(document.title).toBe("Espace sécurisé | TOK");
    expect(content('meta[name="description"]')).toBe("Accédez à votre espace sécurisé TOK.");
    expect(content('meta[name="robots"]')).toBe("noindex,nofollow,noarchive");
    expect(canonical()).toBe(`https://www.thetok.ch${path.replace(/\/$/, "")}`);
    expect(content('meta[property="og:title"]')).toBe(document.title);
  });

  it("updates metadata when leaving coming-soon for settings", () => {
    window.history.replaceState(null, "", "/coming-soon");
    const page = render(<BrowserRouter><ComingSoon /></BrowserRouter>);
    window.history.pushState(null, "", "/parametres/securite");
    page.unmount();
    ensureSeoMetadataForRoute("/parametres/securite");

    expect(document.title).toBe("Espace sécurisé | TOK");
    expect(content('meta[name="robots"]')).toBe("noindex,nofollow,noarchive");
    expect(canonical()).toBe("https://www.thetok.ch/parametres/securite");
  });

  it("does not classify a similarly named unknown route as settings", () => {
    window.history.replaceState(null, "", "/parametres-inconnus");
    ensureSeoMetadataForRoute("/parametres-inconnus");
    expect(document.title).toBe("Page introuvable | TOK");
    expect(content('meta[name="robots"]')).toBe("noindex,nofollow,noarchive");
  });

  it("preserves the public home page metadata after leaving settings", () => {
    ensureSeoMetadataForRoute("/parametres/securite");
    ensureSeoMetadataForRoute("/");
    expect(document.title).toContain("Réservez, commandez");
    expect(content('meta[name="robots"]')).toMatch(/^index,follow/);
    expect(canonical()).toBe("https://www.thetok.ch/");
  });
});
