import { Suspense, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJourneyFocus } from "@/hooks/useJourneyFocus";
import ScrollToTop from "@/components/ScrollToTop";
import { FeatureWizard } from "@/components/FeatureWizard";
import { Sparkles } from "lucide-react";

let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
const scroll = vi.fn();
const reveal = vi.fn();
beforeEach(() => {
  frames = new Map();
  scroll.mockClear(); reveal.mockClear();
  vi.spyOn(window, "scrollTo").mockImplementation(scroll);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: reveal });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Page({ destination, mode = "page", skipInitial = false }: {
  destination: string; mode?: "page" | "section" | "container"; skipInitial?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useJourneyFocus(ref, destination, mode, skipInitial);
  return <div ref={ref} tabIndex={-1} data-testid="content">{destination}<input aria-label="Brief" /></div>;
}
function flushFrames() {
  const callbacks = [...frames.values()]; frames.clear();
  act(() => { callbacks.forEach((callback) => callback(0)); });
}

describe("dashboard journey focus", () => {
  it("focuses a newly mounted destination and resets again after layout", () => {
    render(<Page destination="reservations" />);
    expect(screen.getByTestId("content")).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    flushFrames();
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("does not steal focus or move the page on data refresh", () => {
    const view = render(<Page destination="reservations" />);
    flushFrames(); scroll.mockClear();
    screen.getByLabelText("Brief").focus();
    view.rerender(<Page destination="reservations" />);
    expect(screen.getByLabelText("Brief")).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("reveals each new workflow step without moving on first mount", () => {
    const view = render(<Page destination="support" mode="section" skipInitial />);
    expect(reveal).not.toHaveBeenCalled();
    view.rerender(<Page destination="references" mode="section" skipInitial />);
    expect(screen.getByTestId("content")).toHaveFocus();
    expect(reveal).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    expect(scroll).not.toHaveBeenCalled();
  });

  it("resets only the modal scroll container on step changes", () => {
    const view = render(<Page destination="base" mode="container" skipInitial />);
    const panel = screen.getByTestId("content"); panel.scrollTop = 800;
    view.rerender(<Page destination="schedule" mode="container" skipInitial />);
    expect(panel.scrollTop).toBe(0); expect(panel).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled(); expect(reveal).not.toHaveBeenCalled();
  });

  it("cancels delayed work when the destination unmounts", () => {
    const view = render(<Page destination="photos" />);
    view.unmount(); flushFrames(); expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("resets when a suspended route actually resolves", async () => {
    let ready = false;
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    function DeferredPage() { if (!ready) throw pending; return <Page destination="photos" />; }
    render(<Suspense fallback={<p>Chargement</p>}><DeferredPage /></Suspense>);
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => { ready = true; resolve(); await pending; });
    expect(screen.getByTestId("content")).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
});

function QueryNavigation() {
  const location = useLocation();
  return <><ScrollToTop /><span>{location.search}</span>
    <Link to="/profil?tab=infos&filter=recent">Filtrer</Link>
    <Link to="/profil?tab=favoris">Favoris</Link>
    <Link to="/commandes">Achats</Link>
    <Link to="/profil?tab=infos#coordonnees">Ancre</Link>
  </>;
}
describe("workspace query navigation", () => {
  it("preserves position on filters but resets for tabs and pages", () => {
    render(<MemoryRouter initialEntries={["/profil?tab=infos"]}><QueryNavigation /></MemoryRouter>);
    flushFrames(); scroll.mockClear();
    fireEvent.click(screen.getByText("Filtrer")); expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Favoris")); expect(scroll).toHaveBeenCalled();
    flushFrames(); scroll.mockClear();
    fireEvent.click(screen.getByText("Achats")); expect(scroll).toHaveBeenCalled();
  });
  it("respects deliberate anchor navigation", () => {
    render(<MemoryRouter initialEntries={["/profil?tab=infos"]}><QueryNavigation /></MemoryRouter>);
    flushFrames(); scroll.mockClear();
    fireEvent.click(screen.getByText("Ancre")); expect(scroll).not.toHaveBeenCalled();
  });
});

function Wizard() {
  const [step, setStep] = useState("choix");
  return <FeatureWizard title="Parcours" subtitle="Préparer son choix" colorClass="primary" icon={Sparkles}
    steps={[{ id: "choix", label: "Choix" }, { id: "suite", label: "Récapitulatif" }]} currentStepId={step} onStepChange={setStep}>
    <button onClick={() => setStep("suite")}>Continuer</button>
  </FeatureWizard>;
}
it("reveals and identifies the next client wizard step", () => {
  render(<Wizard />); fireEvent.click(screen.getByText("Continuer"));
  expect(screen.getByRole("main", { name: "Parcours : Récapitulatif" })).toHaveFocus();
  expect(reveal).toHaveBeenCalled();
  expect(screen.getAllByRole("button", { name: /tape 2.*Récapitulatif/i }).every((button) => button.getAttribute("aria-current") === "step")).toBe(true);
});
