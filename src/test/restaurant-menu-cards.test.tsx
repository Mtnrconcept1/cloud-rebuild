import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RestaurantMenuCardsBar, { type RestaurantMenuCard } from "@/components/dashboard/RestaurantMenuCardsBar";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/20261027180000_restaurant_menu_cards.sql"), "utf8");
const dashboardMenu = readFileSync(resolve(root, "src/pages/dashboard/DashboardMenu.tsx"), "utf8");

const cards: RestaurantMenuCard[] = [
  { id: "main", restaurant_id: "r1", name: "Carte principale", is_active: true, activated_at: null, created_at: "2026-10-01T00:00:00Z" },
  { id: "winter", restaurant_id: "r1", name: "Carte d’hiver", is_active: false, activated_at: null, created_at: "2026-10-02T00:00:00Z" },
  { id: "spring", restaurant_id: "r1", name: "Carte de printemps", is_active: false, activated_at: null, created_at: "2026-10-03T00:00:00Z" },
];

function renderBar(overrides: Partial<Parameters<typeof RestaurantMenuCardsBar>[0]> = {}) {
  const props = {
    cards,
    viewedCardId: "main",
    itemCounts: { main: 12, winter: 4 },
    totalItemCount: 16,
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(true),
    onActivate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<RestaurantMenuCardsBar {...props} />);
  return props;
}

describe("restaurant menu cards bar", () => {
  it("presents the current menu as the single active card before any seasonal card exists", () => {
    renderBar({ cards: [], viewedCardId: null, itemCounts: {}, totalItemCount: 9 });
    expect(screen.getByText("Carte actuelle")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activer cette carte/ })).not.toBeInTheDocument();
  });

  it("creates a blank card from a suggested name without activating it", async () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle carte vierge" }));
    fireEvent.click(screen.getByRole("button", { name: "Carte d’automne" }));
    fireEvent.click(screen.getByRole("button", { name: "Créer la carte" }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith("Carte d’automne"));
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it("does not submit an empty card name", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle carte vierge" }));
    fireEvent.change(screen.getByLabelText("Nom de la carte"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Créer la carte" })).toBeDisabled();
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("switches the edited card and only activates after an explicit confirmation", () => {
    const props = renderBar({ viewedCardId: "winter" });
    fireEvent.click(screen.getByRole("button", { name: "Afficher la carte Carte principale (active)" }));
    expect(props.onSelect).toHaveBeenCalledWith("main");

    fireEvent.click(screen.getByRole("button", { name: /Activer cette carte/ }));
    expect(props.onActivate).not.toHaveBeenCalled();
    expect(screen.getByText(/sera masquée pour vos clients/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activer la carte" }));
    expect(props.onActivate).toHaveBeenCalledWith("winter");
  });

  it("warns before activating an empty card and only lets empty inactive cards be deleted", () => {
    const props = renderBar({ viewedCardId: "spring" });
    expect(screen.getByRole("button", { name: /Supprimer/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Supprimer/ }));
    expect(props.onDelete).toHaveBeenCalledWith("spring");

    fireEvent.click(screen.getByRole("button", { name: /Activer cette carte/ }));
    expect(screen.getByText(/Cette carte est vide/)).toBeInTheDocument();
  });

  it("blocks deleting a card that still holds dishes", () => {
    renderBar({ viewedCardId: "winter" });
    expect(screen.getByRole("button", { name: /Supprimer/ })).toBeDisabled();
  });

  it("offers neither activation nor deletion on the active card", () => {
    renderBar({ viewedCardId: "main" });
    expect(screen.queryByRole("button", { name: /Activer cette carte/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Supprimer/ })).not.toBeInTheDocument();
    expect(screen.getByText(/est la carte proposée à vos clients/)).toBeInTheDocument();
  });

  it("disables card management in the commercial demo", () => {
    renderBar({ disabled: true, disabledReason: "Indisponible en démonstration." });
    expect(screen.getByRole("button", { name: "Nouvelle carte vierge" })).toBeDisabled();
    expect(screen.getByText("Indisponible en démonstration.")).toBeInTheDocument();
  });
});

describe("restaurant menu cards migration", () => {
  it("is additive and never deletes production data", () => {
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    expect(migration).not.toMatch(/DROP\s+COLUMN/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/TRUNCATE/i);
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS menu_card_id uuid");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_menu_cards");
  });

  it("keeps a single active card per restaurant and ties dishes to their own restaurant", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS restaurant_menu_cards_one_active_idx[\s\S]*WHERE is_active/);
    expect(migration).toContain("FOREIGN KEY (restaurant_id, menu_card_id)");
    expect(migration).toContain("REFERENCES public.restaurant_menu_cards (restaurant_id, id)");
  });

  it("enforces availability in the database so checkout and public reads follow the active card", () => {
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.menu_items");
    expect(migration).toContain("NEW.is_available := NEW.available_on_card AND v_card_active;");
    // La reprise d'état initial est unique : la réexécution de la migration
    // ne doit pas désactiver durablement les plats d'une carte inactive.
    expect(migration).toMatch(/SET available_on_card = coalesce\(is_available, true\)\s+WHERE available_on_card IS NULL;/);
    expect(migration).toContain("ALTER COLUMN available_on_card SET DEFAULT true");
    expect(migration).toContain("ALTER COLUMN available_on_card SET NOT NULL");
    expect(migration).not.toContain("WHERE available_on_card IS DISTINCT FROM");
  });

  it("rolls back activation if the target card disappears concurrently", () => {
    expect(migration).toContain("IF v_card.id IS NULL THEN");
    expect(migration).toContain("RAISE EXCEPTION 'menu_card_not_found' USING ERRCODE = 'P0002'");
  });

  it("protects the cards table with RLS and only exposes creation and activation through owner-checked RPCs", () => {
    expect(migration).toContain("ALTER TABLE public.restaurant_menu_cards ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("REVOKE ALL ON TABLE public.restaurant_menu_cards FROM PUBLIC, anon, authenticated;");
    expect(migration).toContain("GRANT SELECT, DELETE ON TABLE public.restaurant_menu_cards TO authenticated;");
    expect(migration).not.toMatch(/GRANT[^;]*(INSERT|UPDATE)[^;]*restaurant_menu_cards TO authenticated/);
    expect(migration).toContain("CREATE POLICY tok_connect_oauth_isolation");
    expect(migration).toMatch(/restaurant_menu_cards_owner_delete_inactive[\s\S]*AND NOT is_active/);

    for (const fn of ["create_restaurant_menu_card", "activate_restaurant_menu_card", "menu_items_apply_menu_card"]) {
      const body = migration.slice(migration.indexOf(`FUNCTION public.${fn}(`));
      expect(body.slice(0, 400), fn).toContain("SECURITY DEFINER");
      expect(body.slice(0, 400), fn).toContain("SET search_path = ''");
    }
    expect(migration.match(/public\.auth_owns_restaurant\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/public\.commercial_demo_current_user_is_restricted\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.create_restaurant_menu_card(uuid, text) FROM PUBLIC, anon;");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.activate_restaurant_menu_card(uuid) FROM PUBLIC, anon;");
  });
});

describe("dashboard menu card wiring", () => {
  it("adds dishes to the card being edited and preserves the restaurateur's stock choice", () => {
    expect(dashboardMenu).toContain("...(targetCardId ? { menu_card_id: targetCardId } : {})");
    expect(dashboardMenu).toContain("available_on_card: form.is_available");
    expect(dashboardMenu).toContain(".update({ is_available: !current, available_on_card: !current })");
  });

  it("switches cards only through the server RPCs and never reads cards in the commercial demo", () => {
    expect(dashboardMenu).toContain('supabase.rpc("create_restaurant_menu_card"');
    expect(dashboardMenu).toContain('supabase.rpc("activate_restaurant_menu_card"');
    expect(dashboardMenu).toContain("enabled: !!restaurant && !isCommercialDemo");
    expect(dashboardMenu).not.toMatch(/from\("restaurant_menu_cards"\)[\s\S]{0,80}\.(insert|update)\(/);
  });
});
