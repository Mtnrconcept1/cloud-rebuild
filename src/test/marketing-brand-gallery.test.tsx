import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketingBrandReferences } from "@/components/marketing/MarketingBrandReferences";

describe("marketing brand gallery", () => {
  it("shows the four references and allows opening the originals", () => {
    render(<MarketingBrandReferences />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", "/marketing/brand/tok-v1/geneva.jpg");
    expect(screen.getByText(/Leurs prix et promotions ne sont pas repris/)).toBeInTheDocument();
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.getByText("Référence indisponible")).toBeInTheDocument();
  });
});
