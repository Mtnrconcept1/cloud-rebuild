import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RestaurantPartnerContractPreview from "@/components/contracts/RestaurantPartnerContractPreview";

describe("RestaurantPartnerContractPreview", () => {
  it("opens and closes the accessible full-screen preview", async () => {
    render(<RestaurantPartnerContractPreview onExport={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Lire en grand" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Aperçu grand format du contrat restaurateur",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Contrat restaurateur au format A4"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Imprimer ou enregistrer en PDF" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fermer l'aperçu" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
