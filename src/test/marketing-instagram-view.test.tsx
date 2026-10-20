import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingInstagramView from "@/components/marketing/views/MarketingInstagramView";
import { loadInstagramResearch } from "@/marketing/instagramResearchClient";
import type { InstagramResearchResult } from "../../supabase/functions/_shared/marketing-instagram-research";

vi.mock("@/marketing/instagramResearchClient", () => ({ loadInstagramResearch: vi.fn() }));
const result: InstagramResearchResult = {
  kind: "discovery", observedAt: "2026-10-20T12:00:00Z", accountUsername: "tok_suisse", days: 30,
  warnings: [], truncatedSources: [], accounts: [{ username: "bistrot", name: "Bistrot Genève", followers: 1000, medianEngagementRate: 10, sampledPosts: 1, measuredPosts: 1, url: "https://www.instagram.com/bistrot/" }],
  posts: [
    { id: "111111", caption: "Une table TOK à Genève", username: "tok_suisse", followers: 2000, likes: 90, comments: 10, interactions: 100, engagementRate: 5, source: "@tok_suisse", owned: true, localEvidence: "Légende : Genève", timestamp: "2026-10-19T12:00:00Z", url: "https://www.instagram.com/p/OWN/" },
    { id: "222222", caption: "Une sortie à Genève", username: null, followers: null, likes: 900, comments: 100, interactions: 1000, engagementRate: null, source: "#genevefood", owned: false, localEvidence: "Hashtag local", timestamp: "2026-10-19T12:00:00Z", url: "https://www.instagram.com/reel/EXTERNAL/" },
  ],
};
beforeEach(() => { vi.mocked(loadInstagramResearch).mockReset(); vi.mocked(loadInstagramResearch).mockResolvedValue(result); });
afterEach(() => cleanup());

describe("Instagram research workspace", () => {
  it("starts without network calls and prevents a scan without a verified session", () => {
    render(<MarketingInstagramView canMutateBackend={false} />);
    expect(screen.getByRole("button", { name: "Rechercher sur Instagram" })).toBeDisabled();
    expect(loadInstagramResearch).not.toHaveBeenCalled();
  });
  it("shows sourced rankings and unknown rates explicitly", async () => {
    render(<MarketingInstagramView canMutateBackend />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher sur Instagram" }));
    await screen.findByText("Une sortie à Genève");
    expect(screen.getByText("Taux indisponible")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@bistrot" })).toHaveAttribute("href", "https://www.instagram.com/bistrot/");
    expect(screen.getByText(/5,00/)).toBeInTheDocument();
    expect(loadInstagramResearch).toHaveBeenCalledWith(expect.objectContaining({ action: "instagram_discover" }), expect.any(AbortSignal));
  });
  it("loads owned comments and prepares an editable response for the exact author", async () => {
    render(<MarketingInstagramView canMutateBackend />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher sur Instagram" }));
    await screen.findByText("Une table TOK à Genève");
    vi.mocked(loadInstagramResearch).mockResolvedValue({ kind: "comments", observedAt: result.observedAt, mediaId: "111111", url: "https://www.instagram.com/p/OWN/", nextCursor: null, comments: [{ id: "333333", username: "foodie", text: "Où réserver une table ?", likes: 25, timestamp: null }] });
    fireEvent.click(screen.getByRole("button", { name: "Charger les commentaires TOK" }));
    await screen.findByText("Où réserver une table ?");
    fireEvent.click(screen.getByRole("button", { name: "Répondre à @foodie" }));
    expect((screen.getByLabelText("Réponse à relire") as HTMLTextAreaElement).value).toContain("@foodie");
    fireEvent.change(screen.getByLabelText("Réponse à relire"), { target: { value: "@foodie Voici une réponse personnalisée." } });
    expect(screen.getByLabelText("Réponse à relire")).toHaveValue("@foodie Voici une réponse personnalisée.");
    expect(screen.getByRole("link", { name: "Ouvrir la publication pour répondre" })).toHaveAttribute("href", "https://www.instagram.com/p/OWN/");
    expect(vi.mocked(loadInstagramResearch).mock.calls.some(([request]) => request.action === ("instagram_reply" as string))).toBe(false);
  });
  it("prepares external comments from an explicitly manual observation without reading them through Meta", async () => {
    render(<MarketingInstagramView canMutateBackend />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher sur Instagram" }));
    await screen.findByText("Une sortie à Genève");
    fireEvent.click(screen.getByRole("button", { name: "Préparer une réponse externe" }));
    fireEvent.change(screen.getByLabelText("Pseudo observé sur Instagram"), { target: { value: "@geneve_foodie" } });
    fireEvent.change(screen.getByLabelText("Commentaire observé"), { target: { value: "Une idée de restaurant ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer la réponse" }));
    expect((screen.getByLabelText("Réponse à relire") as HTMLTextAreaElement).value).toContain("@geneve_foodie");
    expect(loadInstagramResearch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Saisie manuelle/)).toBeInTheDocument();
  });
  it("keeps an empty partial scan distinct from an absence of relevant content", async () => {
    vi.mocked(loadInstagramResearch).mockResolvedValue({ ...result, posts: [], accounts: [], warnings: [{ source: "#genevefood", code: "instagram_access_required" }] });
    render(<MarketingInstagramView canMutateBackend />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher sur Instagram" }));
    await screen.findByText(/Autorisations Meta insuffisantes/);
    expect(screen.getByText(/Aucun contenu exploitable dans cet échantillon/)).toBeInTheDocument();
  });
  it("deduplicates additional comment pages before ranking them", async () => {
    render(<MarketingInstagramView canMutateBackend />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher sur Instagram" }));
    await screen.findByText("Une table TOK à Genève");
    const commentPage: InstagramResearchResult = { kind: "comments", observedAt: result.observedAt, mediaId: "111111", url: "https://www.instagram.com/p/OWN/", nextCursor: "after-1", comments: [{ id: "333333", username: "foodie", text: "Une table ?", likes: 25, timestamp: null }] };
    vi.mocked(loadInstagramResearch).mockResolvedValue(commentPage);
    fireEvent.click(screen.getByRole("button", { name: "Charger les commentaires TOK" }));
    await screen.findByText("Une table ?");
    vi.mocked(loadInstagramResearch).mockResolvedValue({ ...commentPage, nextCursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Charger plus de commentaires" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Charger plus de commentaires" })).not.toBeInTheDocument());
    expect(within(screen.getByRole("region", { name: "Commentaires observés" })).getAllByText("Une table ?")).toHaveLength(1);
  });
});
