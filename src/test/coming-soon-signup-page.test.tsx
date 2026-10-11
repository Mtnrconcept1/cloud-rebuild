import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { enabled: false, endsAt: null, serverOffset: 0 } as
    | { enabled: boolean; endsAt: number | null; serverOffset: number }
    | null,
  error: false,
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    roles: ["client"],
    rolesResolved: true,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/components/launch/LaunchGateProvider", () => ({
  useLaunchGate: () => ({
    state: mocks.state,
    error: mocks.error,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/components/launch/LaunchExperience", () => ({
  default: ({ confirmationPending }: { confirmationPending?: boolean }) => (
    <div data-testid="launch-experience">
      {confirmationPending ? "Pending confirmation animation" : "Launch animation"}
    </div>
  ),
}));

import ComingSoon from "@/pages/ComingSoon";

function view(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/coming-soon" element={<ComingSoon />} />
        <Route path="/auth" element={<p>Auth page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TOK coming-soon signup experience", () => {
  beforeEach(() => {
    mocks.state = { enabled: false, endsAt: null, serverOffset: 0 };
    mocks.error = false;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("keeps the animation visible after pending signup even when public launch is enabled", () => {
    view("/coming-soon?welcome=1&email=1");

    expect(screen.getByText("Pending confirmation animation")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Si cette adresse nécessite une confirmation");
    expect(screen.queryByText("Votre inscription est enregistrée.")).not.toBeInTheDocument();
  });

  it("keeps the animation visible when the launch status service fails", () => {
    mocks.state = null;
    mocks.error = true;
    view("/coming-soon?welcome=1&email=1");

    expect(screen.getByText("Pending confirmation animation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("does not change the normal route when launch is disabled and no welcome was requested", () => {
    view("/coming-soon");

    expect(screen.getByText("Auth page")).toBeInTheDocument();
    expect(screen.queryByTestId("launch-experience")).not.toBeInTheDocument();
  });
});
