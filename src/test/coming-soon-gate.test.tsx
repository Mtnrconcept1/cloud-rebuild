import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ComingSoonGate from "@/components/ComingSoonGate";

const authMock = vi.hoisted(() => ({
  state: {
    loading: false,
  },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authMock.state,
}));

describe("ComingSoonGate", () => {
  it("renders its children when the coming soon mode is disabled", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ComingSoonGate>
          <div>Accueil</div>
        </ComingSoonGate>
      </MemoryRouter>,
    );

    expect(screen.getByText("Accueil")).toBeInTheDocument();
  });
});
