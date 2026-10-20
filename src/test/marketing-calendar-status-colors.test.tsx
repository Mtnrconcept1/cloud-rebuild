import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import type { MarketingCalendarItem } from "@/marketing/types";

afterEach(cleanup);

const cases = [
  ["draft", "pending", "Brouillon", "bg-slate-50"],
  ["draft", "approved", "Approuvé", "bg-emerald-50"],
  ["scheduled", "approved", "Planifié", "bg-sky-50"],
  ["running", "approved", "En cours", "bg-violet-50"],
  ["published", "approved", "Publié", "bg-teal-50"],
  ["completed", "approved", "Terminé", "bg-green-50"],
  ["failed", "approved", "Échec", "bg-rose-50"],
  ["cancelled", "approved", "Annulé", "bg-zinc-100"],
  ["blocked_configuration", "approved", "Bloqué", "bg-amber-50"],
] as const;

function mount(status: MarketingCalendarItem["status"], approvalStatus: MarketingCalendarItem["approvalStatus"]) {
  const item: MarketingCalendarItem = {
    id: "calendar-item", campaignId: null, campaignName: "Campagne TOK", title: "Publication de contrôle",
    channel: "instagram", status, approvalStatus, scheduledAt: "2026-10-15T10:00:00Z", timezone: "Europe/Zurich",
    audienceName: "Genève", audienceSize: 0, content: "Texte de contrôle", visualUrl: null, format: null,
    manualOutcome: null, manualNote: null, publishedAt: null, updatedAt: "2026-10-01T00:00:00Z",
  };
  const actions = { onCancel: vi.fn(), onApprove: vi.fn(), onCompleteManual: vi.fn(), onFiltersChange: vi.fn() };
  render(<MarketingCalendarView snapshot={{ ...createFallbackMarketingSnapshot(), calendar: [item] }}
    filters={{ view: "calendar", query: "", status: "all", channel: "all", page: 1, from: "2026-10-01", to: "2026-10-31" }}
    canMutateBackend={false} pendingAction={null} {...actions} />);
  return actions;
}

describe("calendar status colors", () => {
  it.each(cases)("keeps %s/%s consistent in grid, agenda and details", (status, approval, label, color) => {
    const actions = mount(status, approval);
    const chip = screen.getByRole("button", { name: `12:00 — ${label} — Publication de contrôle` });
    expect(chip).toHaveClass(color);
    expect(chip).toHaveAttribute("title", `${label} · Publication de contrôle`);
    const agenda = screen.getByRole("button", { name: /Publication de contrôle.*Campagne TOK/ });
    expect(within(agenda).getByText(label)).toHaveClass(color);
    fireEvent.click(chip);
    expect(within(screen.getByRole("dialog")).getByText(label)).toHaveClass(color);
    expect(actions.onApprove).not.toHaveBeenCalled();
    expect(actions.onCompleteManual).not.toHaveBeenCalled();
  });

  it("shows a readable legend at every width", () => {
    mount("draft", "pending");
    const legend = screen.getByRole("group", { name: "Légende des statuts du calendrier" });
    expect(legend).not.toHaveClass("hidden");
    for (const [, , label] of cases) expect(within(legend).getByText(label)).toBeInTheDocument();
  });
});
