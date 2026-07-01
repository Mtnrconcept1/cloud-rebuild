import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AiGenerationProgressDialog from "@/components/ui/ai-generation-progress-dialog";

describe("AiGenerationProgressDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grows the progress bar and reveals all generation steps over time", () => {
    vi.useFakeTimers();

    render(
      <AiGenerationProgressDialog
        open
        title="Retouche PhotoPro en cours"
        description="TOK prepare la version finale."
        status="PhotoPro travaille le visuel"
        steps={["Analyse photo", "Retouche fidele", "Export galerie"]}
      />,
    );

    const progressbar = screen.getByRole("progressbar");
    const fill = screen.getByTestId("ai-generation-progress-fill");
    const initialProgress = Number(progressbar.getAttribute("aria-valuenow"));

    expect(initialProgress).toBeGreaterThan(0);
    expect(fill).toHaveStyle({ width: `${initialProgress}%` });
    expect(screen.getByText("Analyse photo")).toBeInTheDocument();
    expect(screen.queryByText("Retouche fidele")).not.toBeInTheDocument();
    expect(screen.queryByText("Export galerie")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(11_900);
    });

    expect(screen.queryByText("Retouche fidele")).not.toBeInTheDocument();
    expect(screen.queryByText("Export galerie")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const secondProgress = Number(progressbar.getAttribute("aria-valuenow"));
    expect(secondProgress).toBeGreaterThan(initialProgress);
    expect(secondProgress).toBeLessThan(100);
    expect(fill).toHaveStyle({ width: `${secondProgress}%` });
    expect(screen.getByText("Retouche fidele")).toBeInTheDocument();
    expect(screen.queryByText("Export galerie")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12_300);
    });

    const thirdProgress = Number(progressbar.getAttribute("aria-valuenow"));
    expect(thirdProgress).toBeGreaterThan(secondProgress);
    expect(thirdProgress).toBeLessThan(100);
    expect(fill).toHaveStyle({ width: `${thirdProgress}%` });
    expect(screen.getByText("Export galerie")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(24_000);
    });

    const finalProgress = Number(progressbar.getAttribute("aria-valuenow"));
    expect(finalProgress).toBe(100);
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
