import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";

describe("AiGenerationProgressDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the configured estimate without claiming completion before the result", () => {
    vi.useFakeTimers();

    render(
      <AiGenerationProgressDialog
        open
        kind="image"
        estimatedDurationMs={100_000}
        title="Retouche PhotoPro en cours"
        description="TOK prépare la version finale."
        status="PhotoPro travaille le visuel"
        steps={["Analyse photo", "Retouche fidèle", "Export galerie"]}
      />,
    );

    const progressbar = screen.getByRole("progressbar", { name: "Retouche PhotoPro en cours" });
    const fill = screen.getByTestId("ai-generation-progress-fill");
    const initialProgress = Number(progressbar.getAttribute("aria-valuenow"));

    expect(initialProgress).toBeGreaterThan(0);
    expect(fill).toHaveStyle({ width: `${initialProgress}%` });
    expect(screen.getByText("Analyse photo")).toBeInTheDocument();
    expect(screen.getByText(/Environ 1 min 40 s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    const middleProgress = Number(progressbar.getAttribute("aria-valuenow"));
    expect(middleProgress).toBeGreaterThan(initialProgress);
    expect(middleProgress).toBeLessThan(90);
    expect(fill).toHaveStyle({ width: `${middleProgress}%` });

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    const overtimeProgress = Number(progressbar.getAttribute("aria-valuenow"));
    expect(overtimeProgress).toBeGreaterThan(middleProgress);
    expect(overtimeProgress).toBeLessThan(100);
    expect(screen.getByText("Finalisation en cours…")).toBeInTheDocument();
  });

  it("reports 100 percent only when completion is explicit", () => {
    render(
      <AiGenerationProgressDialog
        open
        completed
        title="Visuel prêt"
        steps={["Analyse", "Composition", "Export"]}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "Visuel prêt" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("Résultat prêt")).toBeInTheDocument();
  });
});
