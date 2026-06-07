import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Actualites responsive guards", () => {
  it("keeps the public feed blocks responsive across client, restaurateur and admin access", () => {
    const page = read("src/pages/Actualites.tsx");
    const card = read("src/components/social/SocialPostCard.tsx");

    expect(page).toContain("overflow-x-hidden");
    expect(page).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]");
    expect(page).toContain("min-w-0 space-y-4 xl:sticky xl:top-28 xl:self-start");
    expect(page).toContain("grid-cols-1 gap-2 sm:grid-cols-2");
    expect(page).not.toContain("min-h-screen overflow-hidden");

    expect(card).toContain("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between");
    expect(card).toContain("w-full min-w-0 flex-1");
    expect(card).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)]");
    expect(card).toContain("TriangleAlert");
    expect(card).not.toContain("MoreHorizontal");
  });

  it("keeps the restaurant dashboard composer controls inside their column", () => {
    const dashboard = read("src/pages/dashboard/DashboardActualites.tsx");
    const composer = read("src/components/social/SocialComposer.tsx");

    expect(dashboard).toContain("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between");
    expect(dashboard).toContain("flex flex-wrap items-center gap-x-3 gap-y-2");

    expect(composer).toContain("flex flex-col gap-4 sm:flex-row");
    expect(composer).toContain("2xl:flex-row");
    expect(composer).toContain("flex w-full min-w-0 flex-wrap items-center gap-2");
    expect(composer).toContain("basis-[13rem]");
    expect(composer).not.toContain("flex shrink-0 flex-wrap items-center gap-2");
    expect(composer).not.toContain("flex min-w-[230px]");
  });
});
