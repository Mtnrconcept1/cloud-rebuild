import { execFileSync } from "node:child_process";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Blog from "@/pages/Blog";
import { launchRouteAllowed } from "@/lib/launchGate";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openBlog(route: string) {
  return render(<MemoryRouter initialEntries={[route]}><Routes><Route path="/blog" element={<Blog />} /><Route path="/blog/:slug" element={<Blog />} /></Routes></MemoryRouter>);
}

describe("native editorial blog", () => {
  it("keeps editorial reading public during launch without opening customer transactions", () => {
    const actor = { authenticated: true, role: "client" as const, roles: ["client" as const], rolesResolved: true };
    expect(launchRouteAllowed("/blog", actor)).toBe(true);
    expect(launchRouteAllowed("/blog/reserver-table-geneve-tok", actor)).toBe(true);
    expect(launchRouteAllowed("/commandes", actor)).toBe(false);
    expect(launchRouteAllowed("/blog-admin", actor)).toBe(false);
  });
  it("lists every article with real crawlable links and theme navigation", () => {
    openBlog("/blog");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Des idées à savourer");
    expect(screen.getByRole("navigation", { name: "Thèmes du blog" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Réserver une table à Genève avec TOK : du choix à la confirmation/ })[0]).toHaveAttribute("href", "/blog/reserver-table-geneve-tok");
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://www.thetok.ch/blog");
  });

  it("renders the full article, a semantic table, its contents and related reading", () => {
    openBlog("/blog/reserver-table-geneve-tok");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Réserver une table à Genève");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sommaire de l’article" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Articles à lire ensuite" })).toBeInTheDocument();
    expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute("content", "article");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("index,follow");
  });

  it("shows the existing noindex error page for an unknown article", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    openBlog("/blog/ce-guide-nexiste-pas");
    expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    expect(document.getElementById("tok-page-json-ld")).not.toBeInTheDocument();
  });

  it("verifies the actual build-time HTML and sitemap contract", () => {
    expect(() => execFileSync(process.execPath, ["--test", "scripts/blog-seo.test.mjs"], { stdio: "pipe", timeout: 20000 })).not.toThrow();
  });
});
