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
});
