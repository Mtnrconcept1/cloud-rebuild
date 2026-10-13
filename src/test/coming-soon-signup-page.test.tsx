import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  role: "client" as string | null,
  roles: ["client"] as string[],
  rolesResolved: true,
  state: { enabled: true, endsAt: Date.now() + 3600000, serverOffset: 0 } as
    | { enabled: boolean; endsAt: number | null; serverOffset: number }
    | null,
  error: false,
  refresh: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user, loading: mocks.loading, role: mocks.role,
    roles: mocks.roles, rolesResolved: mocks.rolesResolved, signOut: mocks.signOut,
  }),
}));
vi.mock("@/components/launch/LaunchGateProvider", () => ({
  useLaunchGate: () => ({
    state: mocks.state, error: mocks.error, refresh: mocks.refresh,
  }),
}));
vi.mock("@/components/launch/LaunchExperience", () => ({
  default: () => <div data-testid="launch-experience">Launch animation</div>,
}));
import ComingSoon from "@/pages/ComingSoon";
function view(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/" element={<p>Public homepage</p>} />
    <Route path="/coming-soon" element={<ComingSoon />} />
    <Route path="/espaces" element={<p>Workspace chooser</p>} />
  </Routes></MemoryRouter>);
}
describe("TOK launch animation only for authenticated clients", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.loading = false;
    mocks.role = "client";
    mocks.roles = ["client"];
    mocks.rolesResolved = true;
    mocks.state = { enabled: true, endsAt: Date.now() + 3600000, serverOffset: 0 };
    mocks.error = false;
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
  });
  afterEach(cleanup);
  it.each(["/coming-soon", "/coming-soon?welcome=1", "/coming-soon?welcome=1&email=1"])(
    "redirects an anonymous visitor back to discovery at %s", url => {
      view(url);
      expect(screen.getByText("Public homepage")).toBeInTheDocument();
      expect(screen.queryByTestId("launch-experience")).not.toBeInTheDocument();
    },
  );
  it("does not show the animation to guests when launch RPC fails", () => {
    mocks.state = null;
    mocks.error = true;
    view("/coming-soon?welcome=1&email=1");
    expect(screen.getByText("Public homepage")).toBeInTheDocument();
  });
  it("waits for session restoration without flashing the animation", () => {
    mocks.loading = true;
    view("/coming-soon");
    expect(screen.getByRole("status")).toHaveTextContent("Vérification de votre session");
    expect(screen.queryByTestId("launch-experience")).not.toBeInTheDocument();
  });
  it("shows the animation and legal links to authenticated clients during launch", () => {
    mocks.user = { id: "client-123" };
    view("/coming-soon?welcome=1");
    expect(screen.getByText("Launch animation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
  });
  it("redirects clients to the application when launch flag is switched off", () => {
    mocks.user = { id: "client-123" };
    mocks.state = { enabled: false, endsAt: null, serverOffset: 0 };
    view("/coming-soon?welcome=1");
    expect(screen.getByText("Workspace chooser")).toBeInTheDocument();
  });
  it("never shows a client-only screen to restaurant sessions", () => {
    mocks.user = { id: "restaurant-123" };
    mocks.role = "restaurateur";
    mocks.roles = ["restaurateur"];
    view("/coming-soon");
    expect(screen.getByText("Workspace chooser")).toBeInTheDocument();
  });
  it("returns to public guest discovery on logout", async () => {
    mocks.user = { id: "client-123" };
    mocks.signOut.mockImplementation(async () => { mocks.user = null; });
    view("/coming-soon");
    expect(screen.getByText("Launch animation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledOnce();
      expect(screen.getByText("Public homepage")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("launch-experience")).not.toBeInTheDocument();
  });
});
