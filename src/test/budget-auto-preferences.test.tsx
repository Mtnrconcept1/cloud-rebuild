import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetAuto from "@/pages/BudgetAuto";

const state = vi.hoisted(() => ({
  preferences: { max_budget: 27, dietary_tags: ["vegan"] },
  save: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "customer" } }) }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "user-preferences" ? state.preferences : [],
    isLoading: false,
  }),
  useMutation: () => ({ mutate: state.save, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe("choix du menu et du budget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("préserve un budget enregistré hors des paliers et les préférences alimentaires", () => {
    render(<MemoryRouter><BudgetAuto /></MemoryRouter>);
    const budget = screen.getByRole("combobox", { name: "Budget max par personne" });
    expect(budget).toHaveValue("27");
    fireEvent.change(budget, { target: { value: "40" } });
    expect(budget).toHaveValue("40");
    expect(state.save).toHaveBeenCalledWith({ max_budget: 40, dietary_tags: ["vegan"] });
    const people = screen.getByRole("combobox", { name: "Nombre de personnes" });
    fireEvent.change(people, { target: { value: "4" } });
    expect(people).toHaveValue("4");
  });

  it("garde au moins un plat sélectionné et expose les choix aux technologies d’assistance", () => {
    render(<MemoryRouter><BudgetAuto /></MemoryRouter>);
    const main = screen.getByRole("button", { name: "Plat", exact: true });
    const starter = screen.getByRole("button", { name: "Entrée", exact: true });
    expect(main).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(main);
    expect(main).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(starter);
    fireEvent.click(main);
    expect(starter).toHaveAttribute("aria-pressed", "true");
    expect(main).toHaveAttribute("aria-pressed", "false");
  });
});
