import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OperationProgressDialog from "@/components/ui/operation-progress-dialog";

describe("OperationProgressDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows contextual stages and keeps an estimated operation below 100 percent", () => {
    vi.useFakeTimers();
    render(
      <OperationProgressDialog
        open
        variant="reservation"
        title="Confirmation de la réservation"
        estimatedDurationMs={8_000}
        steps={["Créneau", "Enregistrement", "Confirmation"]}
      />,
    );

    expect(screen.getByText("Créneau")).toBeInTheDocument();
    expect(screen.getByText("Enregistrement")).toBeInTheDocument();
    expect(screen.getByText("Confirmation")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(Number(screen.getByRole("progressbar", { name: "Confirmation de la réservation" }).getAttribute("aria-valuenow"))).toBeLessThan(100);
    expect(screen.getByText("Vérification finale…")).toBeInTheDocument();
  });
});
