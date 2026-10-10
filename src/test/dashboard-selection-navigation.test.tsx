import { useLayoutEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardRoute from "@/components/DashboardRoute";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";

const state = vi.hoisted(() => ({
  restaurants: [] as Array<{ id: string; name: string; is_active: boolean; is_demo: boolean; status: string; disabled_dashboard_features: string[] }>,
  loading: false,
  frame: null as { snapshot: { session: { demo_restaurant_id: string } } } | null,
}));
vi.mock("@/pages/dashboard/useOwnerRestaurants", () => ({ useOwnerRestaurants: () => ({ ...state, error: null }) }));
vi.mock("@/hooks/useSignupApplication", () => ({ useSignupApplication: () => ({ data: null }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => state.frame }));
vi.mock("@/components/ProtectedRoute", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
const observed: string[] = [];
function Page() {
  const { pathname } = useLocation();
  const { selectedId, setSelectedId } = useDashboardRestaurant();
  useLayoutEffect(() => { observed.push(pathname); }, [pathname]);
  return <>
    <p data-testid="route">{pathname}</p>
    <p data-testid="restaurant">{selectedId}</p>
    <Link to="/dashboard/reservations">Reservations</Link>
    <Link to="/dashboard/photos">Photos</Link>
    <button onClick={() => setSelectedId("second-owned")}>Select second restaurant</button>
    <button onClick={() => setSelectedId("unowned-restaurant")}>Select unrelated restaurant</button>
  </>;
}
function Tree() {
  return <MemoryRouter initialEntries={["/dashboard/reservations"]}><Routes>{["/dashboard", "/dashboard/reservations", "/dashboard/photos"].map(path => <Route key={path} path={path} element={<DashboardRoute><Page /></DashboardRoute>} />)}</Routes></MemoryRouter>;
}
beforeEach(() => {
  localStorage.clear(); observed.length = 0;
  state.loading = false;
  state.frame = null;
  state.restaurants = [{ id: "owned-restaurant", name: "Owned restaurant", is_active: true, is_demo: false, status: "active", disabled_dashboard_features: [] }];
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("dashboard restaurant selection during navigation", () => {
  it("keeps a direct link when the first restaurant arrives asynchronously", async () => {
    const restaurants = state.restaurants;
    state.restaurants = [];
    state.loading = true;
    const view = render(<Tree />);
    state.restaurants = restaurants;
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

  it("ignores a selection outside the authorized owner list", () => {
    render(<Tree />);
    fireEvent.click(screen.getByText("Select unrelated restaurant"));
    expect(screen.getByTestId("restaurant")).toHaveTextContent("owned-restaurant");
    expect(localStorage.getItem("miamz-dashboard-restaurant")).toBe("owned-restaurant");
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations");
  });

  it("persists a changed authorized selection across dashboard navigation", () => {
    state.restaurants.push({ ...state.restaurants[0], id: "second-owned" });
    render(<Tree />);
    fireEvent.click(screen.getByText("Select second restaurant"));
    fireEvent.click(screen.getByText("Photos"));
    expect(screen.getByTestId("restaurant")).toHaveTextContent("second-owned");
    expect(localStorage.getItem("miamz-dashboard-restaurant")).toBe("second-owned");
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/photos");
  });

  it("keeps authorized in-memory selection usable when storage reads and writes fail", () => {
    state.restaurants.push({ ...state.restaurants[0], id: "second-owned" });
    for (const method of ["getItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Storage unavailable", "SecurityError");
      });
    }
    render(<Tree />);
    fireEvent.click(screen.getByText("Select second restaurant"));
    expect(screen.getByTestId("restaurant")).toHaveTextContent("second-owned");
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations");
  });

  it("keeps pending restaurants locked despite a stored selection", () => {
    state.restaurants[0].is_active = false;
    state.restaurants[0].status = "pending";
    localStorage.setItem("miamz-dashboard-restaurant", "owned-restaurant");
    render(<Tree />);
    expect(screen.getByTestId("route").textContent).toBe("/dashboard");
  });

  it("clears an unrelated stored selection when the owner has no restaurants", () => {
    state.restaurants = [];
    localStorage.setItem("miamz-dashboard-restaurant", "unowned-restaurant");
    render(<Tree />);
    expect(screen.getByTestId("restaurant")).toBeEmptyDOMElement();
    expect(localStorage.getItem("miamz-dashboard-restaurant")).toBeNull();
    expect(screen.getByTestId("route").textContent).toBe("/dashboard");
  });

  it("keeps demo selection isolated from owner rows and browser storage", () => {
    state.frame = { snapshot: { session: { demo_restaurant_id: "frame-demo" } } };
    localStorage.setItem("miamz-dashboard-restaurant", "owned-restaurant");
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<Tree />);
    fireEvent.click(screen.getByText("Select unrelated restaurant"));
    expect(screen.getByTestId("restaurant")).toHaveTextContent("frame-demo");
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/reservations");
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
