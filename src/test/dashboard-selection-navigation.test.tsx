import { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardRoute from "@/components/DashboardRoute";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";

const state = vi.hoisted(() => ({ restaurants: [] as Array<{ id: string; name: string; is_active: boolean; is_demo: boolean; status: string; disabled_dashboard_features: string[] }>, loading: false }));
vi.mock("@/pages/dashboard/useOwnerRestaurants", () => ({ useOwnerRestaurants: () => ({ ...state, error: null }) }));
vi.mock("@/hooks/useSignupApplication", () => ({ useSignupApplication: () => ({ data: null }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/components/ProtectedRoute", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
const observed: string[] = [];
function Page() {
  const { pathname } = useLocation();
  const { selectedId } = useDashboardRestaurant();
  useLayoutEffect(() => { observed.push(pathname); }, [pathname]);
  return <><p data-testid="route">{pathname}</p><p data-testid="restaurant">{selectedId}</p><Link to="/dashboard/reservations">Reservations</Link><Link to="/dashboard/photos">Photos</Link></>;
}
function Tree() {
  return <MemoryRouter initialEntries={["/dashboard/reservations"]}><Routes>{["/dashboard", "/dashboard/reservations", "/dashboard/photos"].map(path => <Route key={path} path={path} element={<DashboardRoute><Page /></DashboardRoute>} />)}</Routes></MemoryRouter>;
}
beforeEach(() => {
  localStorage.clear(); observed.length = 0;
  state.loading = false;
  state.restaurants = [{ id: "owned-restaurant", name: "Owned restaurant", is_active: true, is_demo: false, status: "active", disabled_dashboard_features: [] }];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("dashboard restaurant selection during navigation", () => {
  it("keeps a direct link when the first restaurant arrives asynchronously", async () => {
    state.loading = true;
    const view = render(<Tree />);
    state.loading = false;
    view.rerender(<Tree />);
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations"));
    expect(observed).not.toContain("/dashboard");
    expect(screen.getByTestId("restaurant")).toHaveTextContent("owned-restaurant");
  });
  it("normalizes stale stored selection before the access gate can redirect", async () => {
    localStorage.setItem("miamz-dashboard-restaurant", "deleted-restaurant");
    render(<Tree />);
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations"));
    expect(observed).not.toContain("/dashboard");
  });
  it("keeps the selected restaurant across dashboard page changes", async () => {
    localStorage.setItem("miamz-dashboard-restaurant", "owned-restaurant");
    render(<Tree />);
    fireEvent.click(await screen.findByText("Photos"));
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/photos"));
    expect(screen.getByTestId("restaurant")).toHaveTextContent("owned-restaurant");
    expect(observed).not.toContain("/dashboard");
  });
  it("does not grant a restaurant workspace to an account without an owned restaurant", async () => {
    state.restaurants = [];
    render(<Tree />);
    await waitFor(() => expect(screen.getByTestId("route").textContent).toBe("/dashboard"));
    expect(screen.getByTestId("restaurant")).toBeEmptyDOMElement();
  });
  it("does not crash when browser storage rejects persistence", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage unavailable", "SecurityError"); });
    render(<Tree />);
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations"));
  });
});
