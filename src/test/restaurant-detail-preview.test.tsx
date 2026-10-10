import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DirectoryRestaurantOwnershipNotice from "@/components/DirectoryRestaurantOwnershipNotice";
const state = vi.hoisted(() => ({ directory: true }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: () => { const q: any = { select: () => q, eq: () => q, limit: () => q, then: (resolve: any) => Promise.resolve({ data: state.directory ? [{ id: "11111111-1111-1111-1111-111111111111", name: "Chez TOK", city: "Genève", is_directory_listing: true }] : [], error: null }).then(resolve) }; return q; } }) }));
afterEach(() => { cleanup(); state.directory = true; });
describe("directory owner disclosure", () => {
  it("keeps provenance and owner actions in document flow with a collapsed disclosure", async () => {
    window.history.replaceState({}, "", "/restaurant/11111111-1111-1111-1111-111111111111");
    render(<DirectoryRestaurantOwnershipNotice />);
    await waitFor(() => expect(screen.getByText("Restaurant indexé depuis des données publiques")).toBeInTheDocument());
    const notice = screen.getByRole("complementary");
    expect(notice.className).not.toMatch(/fixed|bottom-/);
    const details = screen.getByText("Vous représentez ce restaurant ?").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByRole("button", { name: "Revendiquer mon restaurant", hidden: true }));
    expect(details).toContainElement(screen.getByRole("button", { name: "Supprimer mon restaurant", hidden: true }));
  });
  it("does not show owner actions for a non-directory record", async () => {
    state.directory = false;
    render(<DirectoryRestaurantOwnershipNotice />);
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
  });
});
