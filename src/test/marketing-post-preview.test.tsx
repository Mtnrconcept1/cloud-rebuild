import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingPostImage, MarketingPostPreview } from "@/components/marketing/MarketingPostPreview";
import MarketingCalendarView from "@/components/marketing/views/MarketingCalendarView";
import { createFallbackMarketingSnapshot } from "@/marketing/fallbackSnapshot";
import { normalizeCalendarItem } from "@/marketing/marketingClient";
import { marketingPostPreview, marketingPreviewImageUrl } from "@/marketing/postPreview";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import { buildMetaCaption } from "../../supabase/functions/_shared/meta-publishing";

const { bffRequest } = vi.hoisted(() => ({ bffRequest: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingBffClient")>(),
  marketingBffRequest: bffRequest,
}));

const content = {
  headline: "Restaurateurs genevois",
  body: "Une table, un coût clair.\n\n5 CHF par table, hors abonnement.",
  call_to_action: "Découvrez TOK : https://www.thetok.ch",
  hashtags: ["#TOK", "tok", " Genève ", null, "#Restaurant Genève"],
  visual_url: "https://example.com/campagne.png",
};
const item = normalizeCalendarItem({
  id: "post-1", campaign_id: "campaign-1", campaign_name: "TOK Genève",
  title: "Facturation par table", channel: "instagram", status: "scheduled", approval_status: "approved",
  scheduled_at: "2026-10-11T08:00:00Z", content,
});
const filters: MarketingUrlState = {
  view: "calendar", query: "", status: "all", channel: "all", page: 1, from: "2026-10-01", to: "2026-10-31",
};
afterEach(cleanup);

describe("marketing post previews", () => {
  it.each(["instagram", "facebook"] as const)("keeps the %s caption identical to the actual publisher", (channel) => {
    expect(marketingPostPreview(content, channel)).toEqual({ caption: buildMetaCaption(content, channel), visualUrl: content.visual_url });
    const manyTags = { ...content, hashtags: Array.from({ length: 40 }, (_, i) => `#Tag${i}`) };
    expect(marketingPostPreview(manyTags, channel).caption).toBe(buildMetaCaption(manyTags, channel));
  });

  it("retains the visual and complete caption when normalizing an RPC row", () => {
    expect(item.postPreview?.caption).toContain(content.headline);
    expect(item.postPreview?.caption).toContain(content.call_to_action);
    expect(item.postPreview?.caption).toContain("#TOK #Genève #RestaurantGenève");
    expect(item.postPreview?.visualUrl).toBe(content.visual_url);
    expect(item.content).toBe(content.body); // Existing approval contract stays unchanged.
  });

  it("matches publisher deduplication while displaying overlength drafts for review", () => {
    const legacy = { headline: "Découvrez TOK", body: "Découvrez TOK\n\nRéservez sur https://thetok.ch #TOK", call_to_action: "https://thetok.ch", hashtags: ["TOK", "Geneve"] };
    expect(marketingPostPreview(legacy, "instagram").caption).toBe(buildMetaCaption(legacy, "instagram"));
    expect(marketingPostPreview({ body: "a".repeat(2300) }, "instagram").caption).toHaveLength(2300);
    expect(() => buildMetaCaption({ body: "a".repeat(2300) }, "instagram")).toThrow("meta_content_too_long");
  });

  it("explains that Instagram vertical exports require manual Story publication", () => {
    const preview = marketingPostPreview({ ...content, visual_format: "9:16" }, "instagram");
    expect(preview.visualFormat).toBe("9:16");
    const { rerender } = render(<MarketingPostPreview title="Story" channel="instagram" scheduledAt={item.scheduledAt} preview={preview} />);
    expect(screen.getByText(/export pour publication manuelle en Story/)).toHaveTextContent("Envoi automatique non pris en charge.");
    rerender(<MarketingPostPreview title="Story" channel="facebook" scheduledAt={item.scheduledAt} preview={preview} />);
    expect(screen.queryByText(/export pour publication manuelle en Story/)).toBeNull();
  });

  it.each(["Message historique", { message: "Message historique" }, { text: "Message historique" }, { summary: "Message historique" }])("preserves legacy text-only content", (value) => {
    expect(marketingPostPreview(value, "facebook")).toEqual({ caption: "Message historique", visualUrl: null });
  });

  it("keeps non-social message precedence and tolerates malformed content", () => {
    expect(marketingPostPreview({ ...content, message: "Notification" }, "in_app").caption).toBe("Notification");
    for (const value of [null, [], 42, { body: {}, hashtags: "#TOK" }]) {
      expect(marketingPostPreview(value, "instagram")).toEqual({ caption: "", visualUrl: null });
    }
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,unsafe", "http://example.com/a.png", "https://user:secret@example.com/a.png", "bad-url", null])("does not render unsafe media URL %s", (value) => {
    expect(marketingPreviewImageUrl(value)).toBeNull();
  });

  it("shows the full text, visual and a safe full-size link without rendering HTML", () => {
    render(<MarketingPostPreview title="Test" channel="instagram" scheduledAt={item.scheduledAt}
      preview={{ caption: "<script>alert(1)</script>\nTexte complet #TOK", visualUrl: content.visual_url }} />);
    expect(screen.getByRole("img", { name: "Visuel : Test" })).toHaveAttribute("src", content.visual_url);
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: /Ouvrir le visuel/ })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps text visible after an image failure and tries a new URL", () => {
    const { rerender } = render(<MarketingPostImage title="Test" url={content.visual_url} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Visuel indisponible")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<MarketingPostImage title="Test" url="https://example.com/new.jpg" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/new.jpg");
    rerender(<MarketingPostImage title="Test" url={null} />);
    expect(screen.getByText("Aucun visuel")).toBeInTheDocument();
  });

  it("opens the real calendar post preview without publishing or changing its schedule", () => {
    const snapshot = { ...createFallbackMarketingSnapshot(), calendar: [item] };
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    const onCompleteManual = vi.fn();
    const props = { snapshot, filters, canMutateBackend: true, pendingAction: null, onFiltersChange: vi.fn(), onApprove, onCancel, onCompleteManual };
    const { rerender } = render(<MarketingCalendarView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Voir le visuel et le texte/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", content.visual_url);
    expect(within(dialog).getByText(/Découvrez TOK/)).toHaveTextContent("#TOK #Genève #RestaurantGenève");
    expect(within(dialog).getByText(/heure de Genève/)).toHaveTextContent("10:00");
    expect(onApprove).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onCompleteManual).not.toHaveBeenCalled();
    const updated = { ...item, postPreview: { caption: "Texte actualisé", visualUrl: null } };
    rerender(<MarketingCalendarView {...props} snapshot={{ ...snapshot, calendar: [updated] }} />);
    expect(within(dialog).getByText("Texte actualisé")).toBeInTheDocument();
    expect(within(dialog).queryByRole("img")).toBeNull();
  });

});
