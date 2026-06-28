import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dark mode readability guards", () => {
  it("keeps Chef's Table checkout readable in dark mode", () => {
    const panier = read("src/pages/Panier.tsx");

    expect(panier).toContain("dark:bg-slate-950/95");
    expect(panier).toContain("dark:bg-slate-900/95");
    expect(panier).toContain("dark:text-slate-50");
    expect(panier).toContain("dark:text-slate-200");
    expect(panier).toContain("dark:text-slate-300");
    expect(panier).toContain("dark:text-orange-100");
    expect(panier).toContain("dark:text-orange-200");
  });

  it("keeps social post cards, mobile comments and action buttons readable in dark mode", () => {
    const card = read("src/components/social/SocialPostCard.tsx");

    expect(card).toContain("dark:bg-slate-950/95");
    expect(card).toContain("dark:bg-slate-950");
    expect(card).toContain("dark:bg-slate-900/90");
    expect(card).toContain("dark:text-slate-50");
    expect(card).toContain("dark:text-slate-100");
    expect(card).toContain("dark:text-slate-200");
    expect(card).toContain("dark:text-slate-300");
    expect(card).toContain("dark:placeholder:text-slate-300");
    expect(card).toContain("dark:text-orange-100");
    expect(card).toContain("dark:text-orange-200");
    expect(card).toContain("sm:dark:bg-slate-950/85");
    expect(card).toContain("max-sm:dark:bg-slate-950");
  });

  it("keeps the Actualites feed shell and light metric pills readable in dark mode", () => {
    const page = read("src/pages/Actualites.tsx");

    expect(page).toContain("dark:bg-black dark:bg-none dark:text-slate-50");
    expect(page).toContain("container grid min-w-0 gap-5 dark:bg-black");
    expect(page).toContain("dark:border-white/15 dark:bg-[#101826] dark:text-slate-50");
    expect(page).toContain("bg-white/90 p-3 text-xs text-black");
    expect(page).toContain("dark:bg-white/90 dark:text-black");
    expect(page).toContain("text-slate-500 dark:text-slate-600");
  });
});
