import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LaunchArtwork } from "@/components/launch/LaunchArtwork";

describe("TOK launch artwork", () => {
  it("shows an honest pending-confirmation scene without inventing a launch date", () => {
    render(<LaunchArtwork time={0} remaining={null} reducedMotion confirmationPending />);

    expect(screen.getByRole("img", {
      name: /Demande de confirmation prise en compte.*date de lancement sera annoncée prochainement/i,
    })).toBeInTheDocument();
    expect(screen.getByText("VOTRE INTÉRÊT !")).toBeInTheDocument();
    expect(screen.getByText("À VENIR")).toBeInTheDocument();
    expect(screen.getAllByText("--")).toHaveLength(4);
    expect(screen.queryByText("480H")).not.toBeInTheDocument();
    expect(screen.queryByText("VOTRE INSCRIPTION !")).not.toBeInTheDocument();
  });

  it("displays the real countdown when Supabase provides a launch deadline", () => {
    render(<LaunchArtwork time={0} remaining={86405} reducedMotion />);

    expect(screen.getByRole("img", {
      name: /Lancement dans 1 jours, 0 heures, 0 minutes et 5 secondes/i,
    })).toBeInTheDocument();
    expect(screen.getByText("1J")).toBeInTheDocument();
    expect(screen.getByText("VOTRE INSCRIPTION !")).toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });
});
