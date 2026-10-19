import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketingBrandReferences } from "@/components/marketing/MarketingBrandReferences";

describe("marketing brand gallery", () => {
  it("shows the Instagram master first with the four identity references", () => {
    render(<MarketingBrandReferences />);
    expect(screen.getAllByRole("img")).toHaveLength(5);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute("href", "/marketing/brand/tok-v2/instagram-profile.jpeg");
    expect(screen.getByText(/Leurs prix et promotions ne sont pas repris/)).toBeInTheDocument();
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.getByText("Référence indisponible")).toBeInTheDocument();
  });
});
