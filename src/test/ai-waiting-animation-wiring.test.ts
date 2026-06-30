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

  it("keeps the image-generation waiting dialog close to the TOK neon progress concept", () => {
    const dialog = readSource("src/components/ui/ai-generation-progress-dialog.tsx");

    expect(dialog).toContain("tokAiModalStage");
    expect(dialog).toContain("tokAiModalOrbit");
    expect(dialog).toContain("shadow-[0_24px_90px_rgba(248,92,13,0.42)]");
    expect(dialog).toContain("bg-[radial-gradient(ellipse_at_center");
    expect(dialog).toContain("drop-shadow-[0_0_18px_rgba(251,191,36,0.95)]");
    expect(dialog).toContain("rounded-[1.35rem]");
  });
});
