import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketingWorkspace from "@/pages/marketing/MarketingWorkspace";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import type { MarketingView } from "@/marketing/types";

const { state, setView, update, refresh, logout } = vi.hoisted(() => ({
  state: { view: "agent", query: "", status: "all", channel: "all", page: 1, from: "", to: "" },
  setView: vi.fn(), update: vi.fn(), refresh: vi.fn(), logout: vi.fn(),
}));
const snapshot = createFallbackMarketingSnapshot();
vi.mock("@/marketing/useMarketingUrlState", () => ({ useMarketingUrlState: () => ({ state: { ...state }, setView, update }) }));
vi.mock("@/marketing/useMarketingOperations", () => ({ useMarketingOperations: () => ({
  snapshot, loading: false, refreshing: false, canMutateBackend: true, pendingAction: null, refresh,
}) }));
vi.mock("@/marketing/useMarketingAutopilot", () => ({ useMarketingAutopilot: () => ({ notice: null }) }));
vi.mock("@/marketing/MarketingSessionContext", () => ({ useMarketingSession: () => ({ logout, submitting: false }) }));
vi.mock("@/components/marketing/views/MarketingAgentView", () => ({ default: ({ onUploadPendingChange, onNavigate }: {
  onUploadPendingChange: (pending: boolean) => void; onNavigate: (view: MarketingView) => void;
}) => <div>
  <button onClick={() => onUploadPendingChange(true)}>Commencer l’import IA</button>
  <button onClick={() => onUploadPendingChange(false)}>Terminer l’import IA</button>
  <button onClick={() => { onUploadPendingChange(true); onNavigate("calendar"); }}>Commencer et naviguer</button>
</div> }));
vi.mock("@/components/marketing/views/MarketingCampaignsView", () => ({ default: ({ onUploadPendingChange }: {
  onUploadPendingChange: (pending: boolean) => void;
}) => <div>
  <button onClick={() => onUploadPendingChange(true)}>Commencer l’import galerie</button>
  <button onClick={() => onUploadPendingChange(false)}>Terminer l’import galerie</button>
</div> }));
beforeEach(() => { state.view = "agent"; vi.clearAllMocks(); });

describe("mailing upload navigation guard", () => {
  it.each(["agent", "campaigns"])("locks workspace navigation and refresh for uploads in %s and releases them afterwards", (view) => {
    state.view = view;
    render(<MarketingWorkspace />);
    const label = view === "agent" ? "IA" : "galerie";
    fireEvent.click(screen.getByRole("button", { name: `Commencer l’import ${label}` }));
    const navigation = screen.getByRole("button", { name: /^Calendrier/ });
    const refreshButton = screen.getByRole("button", { name: "Actualiser les données marketing" });
    expect(navigation).toBeDisabled();
    expect(refreshButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Se déconnecter du centre marketing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ouvrir la navigation marketing" })).toBeDisabled();
    const administration = screen.getByRole("link", { name: "Retour à l'administration" });
    expect(administration).toHaveAttribute("aria-disabled", "true");
    expect(fireEvent.click(administration)).toBe(false);
    fireEvent.click(navigation); fireEvent.click(refreshButton);
    expect(setView).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled();
    const blockedUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(blockedUnload);
    expect(blockedUnload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: `Terminer l’import ${label}` }));
    expect(navigation).toBeEnabled(); expect(refreshButton).toBeEnabled();
    const allowedUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(allowedUnload);
    expect(allowedUnload.defaultPrevented).toBe(false);
    fireEvent.click(navigation); fireEvent.click(refreshButton);
    expect(setView).toHaveBeenCalledWith("calendar"); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("guards callbacks synchronously before the next React render", () => {
    render(<MarketingWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Commencer et naviguer" }));
    expect(setView).not.toHaveBeenCalled();
  });
  it("keeps the active editor mounted when browser history changes the URL view during upload", () => {
    const { rerender } = render(<MarketingWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Commencer l’import IA" }));
    // A POP changes the URL-state hook independently from guarded callbacks.
    state.view = "campaigns";
    rerender(<MarketingWorkspace />);
    expect(screen.getByRole("button", { name: "Terminer l’import IA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commencer l’import galerie" })).not.toBeInTheDocument();
    expect(setView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Terminer l’import IA" }));
    expect(screen.getByRole("button", { name: "Commencer l’import galerie" })).toBeInTheDocument();
  });
  it("cleans up the unload guard when the workspace unmounts", () => {
    const { unmount } = render(<MarketingWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Commencer l’import IA" }));
    unmount();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
