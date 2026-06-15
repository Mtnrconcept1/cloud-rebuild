import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("dashboard advisor history", () => {
  it("exposes a restaurant-scoped consultable AI history", () => {
    const source = readSource("src/pages/dashboard/DashboardAdvisor.tsx");

    expect(source).toContain("AI_HISTORY_STORAGE_PREFIX");
    expect(source).toContain("saveAdvisorHistoryEntry");
    expect(source).toContain("loadAdvisorHistory");
    expect(source).toContain("Historique");
    expect(source).toContain("Charger");
    expect(source).toContain("setHistoryOpen");
  });
});
