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

  it("keeps the image-generation dialog animated, accessible and honest about progress", () => {
    const dialog = readSource("src/components/ui/ai-generation-progress-dialog.tsx");
    const progressHook = readSource("src/hooks/use-estimated-progress.ts");

    expect(dialog).toContain("tokAiOrbit");
    expect(dialog).toContain("tokAiBreathe");
    expect(dialog).toContain("tokAiSweep");
    expect(dialog).toContain("useEstimatedProgress");
    expect(dialog).toContain("ESTIMATED_DURATION_BY_KIND");
    expect(dialog).toContain('role="progressbar"');
    expect(dialog).toContain("aria-valuenow={progress}");
    expect(dialog).toContain("style={{ width: `${progress}%` }}");
    expect(dialog).toContain('data-testid="ai-generation-progress-fill"');
    expect(dialog).toContain("activeStepIndex");
    expect(dialog).toContain("hideCloseButton={!dismissible}");
    expect(dialog).toContain("prefers-reduced-motion");
    expect(progressHook).toContain("if (completed) return 100");
    expect(progressHook).toContain("safeMaximum");
    expect(progressHook).toContain("Math.exp");
  });
});
