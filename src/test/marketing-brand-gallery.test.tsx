import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketingBrandReferences } from "@/components/marketing/MarketingBrandReferences";

describe("marketing brand gallery", () => {
  it("shows the validated feed, culinary and Studio chef masters with the updated palette", () => {
    render(<MarketingBrandReferences />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/marketing/brand/tok-v3/instagram-profile.jpeg");
    expect(links[1]).toHaveAttribute("href", "/marketing/brand/tok-v3/culinary.jpeg");
    expect(links[2]).toHaveAttribute("href", "/marketing/brand/tok-v3/studio-chef.jpeg");
    expect(screen.getByText(/arches arrondies, soulignements au pinceau et logo avec sa bulle Miamz!/)).toBeInTheDocument();
    expect(screen.getByText(/Leurs prix et promotions ne sont pas repris/)).toBeInTheDocument();
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.getByText("Référence indisponible")).toBeInTheDocument();
  });
});
