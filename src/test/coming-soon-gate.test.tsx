import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  state: {
    loading: false,
  },
}));

const flagMock = vi.hoisted(() => ({
  isEnabled: (_name: string) => false,
  loading: false,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authMock.state,
}));

vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlagSnapshot: () => flagMock,
}));

async function loadComingSoonGate() {
  const module = await import("@/components/ComingSoonGate");
  return module.default;
}

describe("ComingSoonGate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    flagMock.isEnabled = () => false;
  });

  it("renders its children when the coming soon mode is disabled", async () => {
    vi.stubEnv("VITE_COMING_SOON", "false");
    const ComingSoonGate = await loadComingSoonGate();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ComingSoonGate>
          <div>Accueil</div>
        </ComingSoonGate>
      </MemoryRouter>,
    );

    expect(screen.getByText("Accueil")).toBeInTheDocument();
  });

  it("redirects public routes to the coming soon page when the gate is enabled via env", async () => {
    vi.stubEnv("VITE_COMING_SOON", "true");
    const ComingSoonGate = await loadComingSoonGate();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={(
              <ComingSoonGate>
                <div>Accueil</div>
              </ComingSoonGate>
            )}
          />
          <Route path="/coming-soon" element={<div>Bient├┤t</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Accueil")).not.toBeInTheDocument();
    expect(screen.getByText("Bient├┤t")).toBeInTheDocument();
  });

  it("redirects public routes when the coming-soon feature flag is enabled", async () => {
    vi.stubEnv("VITE_COMING_SOON", "false");
    flagMock.isEnabled = (name: string) => name === "coming-soon";
    const ComingSoonGate = await loadComingSoonGate();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={(
              <ComingSoonGate>
                <div>Accueil</div>
              </ComingSoonGate>
            )}
          />
          <Route path="/coming-soon" element={<div>Bient├┤t</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Accueil")).not.toBeInTheDocument();
    expect(screen.getByText("Bient├┤t")).toBeInTheDocument();
  });
});
