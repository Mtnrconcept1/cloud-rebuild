import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoyaltyStatus from "@/components/LoyaltyStatus";

const testState = vi.hoisted(() => ({
  profile: {
    loyalty_points: 3574,
    current_tier: "gold",
  },
  tiers: [] as Array<{ name: string; benefits: Record<string, unknown> }>,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "loyalty-tiers") {
      return { data: testState.tiers };
    }

    return { data: testState.profile };
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: testState.profile }),
        }),
      }),
    }),
  }),
}));

describe("LoyaltyStatus dialog layout", () => {
  beforeEach(() => {
    testState.tiers = [];
  });

  it("opens above the mobile navbar and keeps benefits scrollable", () => {
    render(<LoyaltyStatus />);

    fireEvent.click(screen.getByRole("button", { name: /d.couvrir les avantages/i }));

    const dialog = screen.getByRole("dialog", { name: /avantages gold/i });
    expect(dialog).toHaveClass("z-[90]");

    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).toHaveClass("z-[80]");

    const scrollRegion = screen.getByText("Avantages actifs").closest(".overflow-y-auto");
    expect(scrollRegion).toHaveClass("overscroll-contain");
    expect(scrollRegion).toHaveClass("pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]");
  });

  it("uses admin-configured Miamz benefit text and hides disabled benefits", () => {
    testState.tiers = [
      {
        name: "gold",
        benefits: {
          miamz_benefits: {
            priority_support: { enabled: false },
            restaurant_gifts: {
              enabled: true,
              title: "Invitation dégustation admin",
              description: "Texte visible piloté depuis le Dashboard admin.",
            },
          },
        },
      },
    ];

    render(<LoyaltyStatus />);

    fireEvent.click(screen.getByRole("button", { name: /d.couvrir les avantages/i }));

    expect(screen.getByText("Invitation dégustation admin")).toBeInTheDocument();
    expect(screen.getByText("Texte visible piloté depuis le Dashboard admin.")).toBeInTheDocument();
    expect(screen.queryByText("Support prioritaire")).not.toBeInTheDocument();
  });
});
