import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootstrap = readFileSync("public/app-bootstrap.js", "utf8");
const template = readFileSync("index.html", "utf8");

describe("initial application handoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-tok-booting");
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("starts before the body and uses a CSP-compatible same-origin script", () => {
    expect(template.indexOf('<script src="/app-bootstrap.js"></script>')).toBeLessThan(template.indexOf("<body>"));
    expect(template).toContain('id="tok-boot-status" role="status"');
    expect(template).not.toContain('<html lang="fr-CH" data-tok-booting');
  });

  it("shows static content without JS and swaps visibility only during startup", async () => {
    const style = document.createElement("style");
    style.textContent = template.match(/<style>([\s\S]*?)<\/style>/)![1];
    document.head.append(style);
    try {
      document.body.innerHTML = '<div id="tok-boot-status">Chargement</div><div id="root"><section id="tok-prerendered-content">Restaurants</section></div>';
      const root = document.getElementById("root")!;
      const status = document.getElementById("tok-boot-status")!;
      const fallback = document.getElementById("tok-prerendered-content")!;
      expect(getComputedStyle(root).display).not.toBe("none");
      expect(getComputedStyle(status).display).toBe("none");
      window.eval(bootstrap);
      expect(getComputedStyle(fallback).display).toBe("none");
      expect(getComputedStyle(root).display).not.toBe("none");
      expect(getComputedStyle(status).display).toBe("grid");
      root.innerHTML = "<main>Accueil</main>";
      await Promise.resolve();
      expect(getComputedStyle(root).display).not.toBe("none");
      expect(getComputedStyle(status).display).toBe("none");
    } finally {
      style.remove();
    }
  });

  it("waits through parsing and SEO mutations, then hands off to React", async () => {
    window.eval(bootstrap);
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(true);
    document.body.innerHTML = '<div id="root"></div>';
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(true);
    const root = document.getElementById("root")!;
    root.innerHTML = '<section id="tok-prerendered-content"><h1>Restaurants à Genève</h1></section>';
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(true);
    root.querySelector("h1")!.textContent = "Adresses vérifiées";
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(true);
    root.innerHTML = '<main>Accueil TOK</main>';
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    root.innerHTML = '<main>Recherche</main>';
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(false);
  });

  it("restores intact static content when the application bundle fails", async () => {
    window.eval(bootstrap);
    document.body.innerHTML = '<div id="root"><section id="tok-prerendered-content"><a href="/recherche">Restaurants</a></section></div>';
    await Promise.resolve();
    vi.advanceTimersByTime(10000);
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(false);
    expect(document.querySelector("#root a")?.getAttribute("href")).toBe("/recherche");
  });

  it("reveals the first application UI for routes without prerendered content", async () => {
    window.eval(bootstrap);
    document.body.innerHTML = '<div id="root"><main>Ouverture de la page</main></div>';
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-tok-booting")).toBe(false);
  });
});
