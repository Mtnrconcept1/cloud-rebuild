import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiLoadingState } from "@/components/ui/ai-loading-state";

describe("AiLoadingState", () => {
  it("announces long AI work with an animated accessible status", () => {
    render(
      <AiLoadingState
        title="Generation du rapport IA"
        description="Analyse des donnees, synthese et recommandations."
        steps={["Analyse", "Synthese", "Export"]}
      />,
    );

    const status = screen.getByRole("status");

    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Generation du rapport IA");
    expect(status).toHaveTextContent("Analyse des donnees, synthese et recommandations.");
    expect(screen.getByText("Analyse")).toBeInTheDocument();
    expect(screen.getByText("Synthese")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(status.querySelector(".animate-spin")).not.toBeNull();
    expect(status.querySelector(".animate-pulse")).not.toBeNull();
  });
});
