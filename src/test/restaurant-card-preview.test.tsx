import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RestaurantCard from "@/components/RestaurantCard";
import SponsoredRestaurantTemplateCard from "@/components/campaigns/SponsoredRestaurantTemplateCard";
const state = vi.hoisted(() => ({ favorite: false, user: null as { id: string } | null, toast: vi.fn(), insert: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: () => ({ insert: state.insert }) }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/lib/featureFlags", () => ({ useActiveFeatures: () => new Set() }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/hooks/useSponsoredImpressionOnView", () => ({ useSponsoredImpressionOnView: () => null }));
vi.mock("@/lib/analytics", () => ({ trackSponsoredClick: vi.fn(), trackImpression: vi.fn(), trackClick: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }), useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "favorite" ? state.favorite : undefined }) }));
const props = { id: "r1", name: "Chez TOK", cuisine: "Italien", rating: 8.3, reviewCount: 7, imageUrl: "", priceRange: 2, city: "Genève", deliveryAvailable: false, supportsReservation: false };
function Probe() { const l = useLocation(); return <output data-testid="path">{l.pathname}</output>; }
afterEach(() => { cleanup(); state.favorite = false; state.user = null; vi.clearAllMocks(); });
describe("accessible restaurant card actions", () => {
  it("names the favorite, exposes state and leaves card navigation untouched when clicked", () => {
    render(<MemoryRouter><RestaurantCard {...props} /><Probe /></MemoryRouter>);
    const favorite = screen.getByRole("button", { name: "Ajouter Chez TOK aux favoris" });
    expect(favorite).toHaveAttribute("aria-pressed", "false"); expect(favorite).toHaveClass("h-11", "w-11");
    fireEvent.click(favorite); expect(state.toast).toHaveBeenCalled(); expect(screen.getByTestId("path")).toHaveTextContent("/");
    fireEvent.click(screen.getByRole("link", { name: "Voir le restaurant" })); expect(screen.getByTestId("path").textContent).toMatch(/^\/restaurant\//);
  });
  it("reports a failed favorite mutation without claiming success", async () => {
    state.user = { id: "u1" }; state.insert.mockResolvedValue({ error: new Error("network") });
    render(<MemoryRouter><RestaurantCard {...props} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter Chez TOK aux favoris" }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Le favori n’a pas pu être mis à jour", variant: "destructive" })));
    expect(state.invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ajouter Chez TOK aux favoris" })).toBeEnabled();
  });
  it("exposes the selected favorite and actual rating scale", () => {
    state.favorite = true; render(<MemoryRouter><RestaurantCard {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Retirer Chez TOK des favoris" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("sur 10")).toBeInTheDocument(); expect(screen.getByText("7 avis")).toBeVisible();
  });
  it("provides a keyboard reachable restaurant link on sponsored cards", () => {
    render(<MemoryRouter><RestaurantCard {...props} sponsoredCampaignId="campaign-1" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Découvrir l’offre|Découvrir l'offre/ })).toHaveAttribute("href", expect.stringMatching(/^\/restaurant\//));
  });
  it("gives sponsored favorites the restaurant name and does not invent missing venue facts", () => {
    const favorite = vi.fn(); render(<SponsoredRestaurantTemplateCard restaurantName="Chez TOK" imageUrl="" cuisine="" city="" rating={0} reviewCount={0} onFavoriteClick={favorite} />);
    const button = screen.getByRole("button", { name: "Ajouter Chez TOK aux favoris" });
    expect(button).toHaveAttribute("aria-pressed", "false"); expect(button).toHaveClass("h-11", "w-11"); fireEvent.click(button); expect(favorite).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("5.7")).not.toBeInTheDocument(); expect(screen.queryByText(/Puplinge|Rue de Graman|18%/)).not.toBeInTheDocument();
    expect(screen.getByText("Pas encore d’avis")).toBeVisible();
  });
});
