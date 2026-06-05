import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("AI waiting animations wiring", () => {
  it("uses the shared animated AI loader in long-running report and assistant modules", () => {
    [
      "src/pages/admin/AdminComptaAi.tsx",
      "src/pages/admin/AdminAiOperations.tsx",
      "src/pages/dashboard/DashboardFactures.tsx",
      "src/pages/dashboard/DashboardAdvisor.tsx",
      "src/components/floor-plan/FloorPlanAIPanel.tsx",
    ].forEach((path) => {
      expect(readSource(path), path).toContain("AiLoadingState");
    });
  });
});
