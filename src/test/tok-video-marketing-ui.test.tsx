import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TokVideoAiPanel from "@/components/dashboard/TokVideoAiPanel";
import { createTokVideoStudioDraft, readTokVideoStudioDraft, type TokVideoJob } from "@/lib/ai/tokVideoClient";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/ai/tokVideoClient", async (original) => ({ ...await original<typeof import("@/lib/ai/tokVideoClient")>(), requestTokVideo: mocks.request }));

const photoA = "10000000-0000-4000-8000-000000000001";
const photoB = "10000000-0000-4000-8000-000000000002";
const restaurantId = "10000000-0000-4000-8000-000000000003";
const props = {
  restaurantId,
  photoIds: [photoA, photoB],
  logoId: null,
  prompt: "Mettre en valeur notre plat et la salle photographiée.",
  selectedPhotos: [{ id: photoA, label: "Plat du jour" }, { id: photoB, label: "Notre équipe" }],
};
const quote = { credits: 417, estimatedProviderChf: 3.74, maxChargedChf: 3.75, model: "bytedance/seedance-2.5/reference-to-video" };
const completedJob: TokVideoJob = {
  id: "job-1", status: "completed", prompt: "Animation du restaurant", duration: 10, resolution: "720p", aspectRatio: "9:16",
  generateAudio: false, outputFormat: "mp4", credits: 417, model: quote.model, referenceMediaId: photoA, errorCode: null,
  createdAt: "2026-11-05T12:00:00Z", updatedAt: "2026-11-05T12:01:00Z", videoUrl: "https://storage.example/video.mp4",
};
const settingsKey = "tok:video-studio:settings:v2:" + restaurantId;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.request.mockImplementation(async (_restaurantId, input) => {
    if (input.action === "list") return { jobs: [] };
    if (input.action === "quote") return { quote };
    return { job: completedJob };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function requestQuote() {
  const consent = screen.getByRole("checkbox", { name: /J'autorise une interprétation/ });
  if (!(consent as HTMLInputElement).checked) fireEvent.click(consent);
  const button = screen.getByRole("button", { name: "Obtenir le devis de l'animation" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Confirmer et générer" });
}

describe("Marketing video controls", () => {
  it("sends every chosen setting and media role in the confirmed generation contract", async () => {
    render(<TokVideoAiPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Style de publicité"), { target: { value: "tv_spot" } });
    fireEvent.change(screen.getByLabelText("Produit, plat ou expérience à présenter"), { target: { value: "Le plat du jour photographié." } });
    fireEvent.change(screen.getByLabelText("Accroche visuelle"), { target: { value: "Dévoiler progressivement l'assiette." } });
    fireEvent.change(screen.getByLabelText("Décor et ambiance"), { target: { value: "La salle réelle, lumière chaude." } });
    fireEvent.change(screen.getByLabelText("Photo du produit principal"), { target: { value: photoA } });
    fireEvent.change(screen.getByLabelText("Photo du présentateur"), { target: { value: photoB } });
    fireEvent.change(screen.getByLabelText("Référence d'ouverture"), { target: { value: photoA } });
    fireEvent.change(screen.getByLabelText("Référence de fin"), { target: { value: photoB } });
    fireEvent.change(screen.getByLabelText("Appel à l’action à afficher (facultatif)"), { target: { value: "Réservez votre table" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Voix off/ }));
    fireEvent.change(screen.getByLabelText("Langue de la voix off"), { target: { value: "en" } });
    fireEvent.change(screen.getByLabelText("Texte exact de la voix off"), { target: { value: "Welcome to our restaurant." } });
    fireEvent.change(screen.getByLabelText("Durée"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Résolution"), { target: { value: "1080p" } });
    fireEvent.change(screen.getByLabelText("Format d’image"), { target: { value: "21:9" } });
    fireEvent.change(screen.getByLabelText("Type de fichier"), { target: { value: "mov" } });
    fireEvent.change(screen.getByLabelText("Débit vidéo"), { target: { value: "high" } });
    await requestQuote();
    expect(screen.getByText("15 s · 21:9 · 1080p · MOV · avec son")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    await waitFor(() => expect(mocks.request.mock.calls.some(([, input]) => input.action === "start")).toBe(true));
    const input = mocks.request.mock.calls.find(([, input]) => input.action === "start")![1];
    expect(input).toMatchObject({
      duration: 15, resolution: "1080p", aspectRatio: "21:9", outputFormat: "mov", bitrateMode: "high", generateAudio: true,
      confirmedCredits: 417, confirmedModel: quote.model, referenceMediaIds: [photoA, photoB],
      marketing: {
        creativeFormat: "tv_spot", productDescription: "Le plat du jour photographié.", hook: "Dévoiler progressivement l'assiette.", setting: "La salle réelle, lumière chaude.",
        productMediaId: photoA, avatarMediaId: photoB, startImageMediaId: photoA, endImageMediaId: photoB,
        audioMode: "voiceover", language: "en", voiceoverText: "Welcome to our restaurant.", callToAction: "Réservez votre table",
      },
    });
    expect(input).not.toHaveProperty("product_ids");
    expect(input).not.toHaveProperty("style_id");
  });

  it.each([
    ["Durée", "12"], ["Résolution", "1080p"], ["Format d’image", "4:3"],
    ["Type de fichier", "mov"], ["Débit vidéo", "high"], ["Style de publicité", "ugc"],
    ["Accroche visuelle", "Ouvrir sur le détail de l'assiette"], ["Photo du produit principal", photoA],
    ["Appel à l’action à afficher (facultatif)", "Réservez votre table"],
  ])("requires a new quote and debit approval after changing %s", async (label, value) => {
    render(<TokVideoAiPanel {...props} />);
    await requestQuote();
    fireEvent.click(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." }));
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.queryByRole("button", { name: "Confirmer et générer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeEnabled();
    await requestQuote();
    expect(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();
    expect(mocks.request.mock.calls.some(([, input]) => input.action === "start")).toBe(false);
  });

  it("keeps a voiceover draft but requires its exact text before a paid request", async () => {
    const first = render(<TokVideoAiPanel {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise une interprétation/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Voix off/ }));
    fireEvent.change(screen.getByLabelText("Langue de la voix off"), { target: { value: "it" } });
    fireEvent.change(screen.getByLabelText("Durée"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeDisabled();
    first.unmount();
    render(<TokVideoAiPanel {...props} />);
    expect(screen.getByRole("radio", { name: /^Voix off/ })).toBeChecked();
    expect(screen.getByLabelText("Langue de la voix off")).toHaveValue("it");
    expect(screen.getByLabelText("Durée")).toHaveValue("20");
    expect(screen.getByLabelText("Texte exact de la voix off")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Texte exact de la voix off"), { target: { value: "Benvenuti nel nostro ristorante." } });
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /^Sans son/ }));
    expect(screen.getByText(/Votre script est conservé/)).toBeVisible();
    await requestQuote();
    expect(mocks.request.mock.calls.find(([, input]) => input.action === "quote")![1]).toMatchObject({ generateAudio: false,
      marketing: { audioMode: "silent", voiceoverText: "Benvenuti nel nostro ristorante." } });
  });

  it("restores settings without restoring a price confirmation or issuing a generation", async () => {
    const first = render(<TokVideoAiPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Style de publicité"), { target: { value: "ugc" } });
    fireEvent.change(screen.getByLabelText("Photo du produit principal"), { target: { value: photoA } });
    fireEvent.change(screen.getByLabelText("Résolution"), { target: { value: "1080p" } });
    await requestQuote();
    fireEvent.click(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." }));
    first.unmount();
    render(<TokVideoAiPanel {...props} />);
    expect(screen.getByLabelText("Style de publicité")).toHaveValue("ugc");
    expect(screen.getByLabelText("Photo du produit principal")).toHaveValue(photoA);
    expect(screen.getByLabelText("Résolution")).toHaveValue("1080p");
    expect(screen.queryByRole("button", { name: "Confirmer et générer" })).not.toBeInTheDocument();
    expect(mocks.request.mock.calls.some(([, input]) => input.action === "start")).toBe(false);
    const stored = JSON.parse(localStorage.getItem(settingsKey)!);
    expect(stored).not.toHaveProperty("confirmed"); expect(stored).not.toHaveProperty("quote");
  });

  it("blocks generation when a photo assigned to a role is removed", async () => {
    const view = render(<TokVideoAiPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Photo du produit principal"), { target: { value: photoA } });
    await requestQuote();
    view.rerender(<TokVideoAiPanel {...props} photoIds={[photoB]} />);
    expect(screen.queryByRole("button", { name: "Confirmer et générer" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Photo du produit principal")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Photo du produit principal"), { target: { value: photoB } });
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeEnabled();
  });

  it("isolates settings and ignores a late history response after changing restaurant", async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation(async (id) => id === restaurantId ? new Promise((resolve) => { finish = resolve; }) : { jobs: [] });
    const view = render(<TokVideoAiPanel {...props} />);
    fireEvent.change(screen.getByLabelText("Durée"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Accroche visuelle"), { target: { value: "Notre plat du jour" } });
    view.rerender(<TokVideoAiPanel {...props} restaurantId="another-restaurant" />);
    expect(screen.getByLabelText("Durée")).toHaveValue("10");
    expect(screen.getByLabelText("Accroche visuelle")).toHaveValue("");
    await act(async () => { finish({ jobs: [completedJob] }); });
    expect(screen.queryByRole("link", { name: "Ouvrir la vidéo" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(settingsKey)!).duration).toBe(30);
  });

  it("locks Actualité delivery while keeping the saved marketing format available", async () => {
    localStorage.setItem(settingsKey, JSON.stringify({ ...createTokVideoStudioDraft(), duration: 15, resolution: "1080p", aspectRatio: "16:9", outputFormat: "mov" }));
    const view = render(<TokVideoAiPanel {...props} mode="reel" />);
    expect(screen.getByLabelText("Durée")).toBeDisabled(); expect(screen.getByLabelText("Durée")).toHaveValue("10");
    expect(screen.getByLabelText("Résolution")).toBeDisabled(); expect(screen.getByLabelText("Résolution")).toHaveValue("720p");
    expect(screen.getByLabelText("Format d’image")).toBeDisabled(); expect(screen.getByLabelText("Format d’image")).toHaveValue("9:16");
    expect(screen.getByLabelText("Type de fichier")).toBeDisabled(); expect(screen.getByLabelText("Type de fichier")).toHaveValue("mp4");
    await requestQuote();
    expect(mocks.request.mock.calls.find(([, input]) => input.action === "quote")![1]).toMatchObject({ duration: 10, resolution: "720p", aspectRatio: "9:16", outputFormat: "mp4" });
    view.unmount();
    render(<TokVideoAiPanel {...props} mode="marketing" />);
    expect(screen.getByLabelText("Durée")).toBeEnabled(); expect(screen.getByLabelText("Durée")).toHaveValue("15");
    expect(screen.getByLabelText("Résolution")).toHaveValue("1080p");
    expect(screen.getByLabelText("Type de fichier")).toHaveValue("mov");
  });

  it.each([{ outputFormat: "mov" as const }, { resolution: "1080p" }, { aspectRatio: "16:9" }, { duration: 15 }])("keeps incompatible history videos downloadable without attaching them to Actualité: %j", async (change) => {
    mocks.request.mockResolvedValue({ jobs: [{ ...completedJob, ...change }] });
    render(<TokVideoAiPanel {...props} mode="reel" onUseVideo={vi.fn()} />);
    expect(await screen.findByRole("link", { name: "Ouvrir la vidéo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ajouter au brouillon" })).not.toBeInTheDocument();
    expect(screen.getByText(/L’ajout à Actualité nécessite un MP4/)).toBeVisible();
  });

  it("restores only bounded choices and text from malformed browser storage", () => {
    expect(readTokVideoStudioDraft("not-json")).toEqual(createTokVideoStudioDraft());
    const restored = readTokVideoStudioDraft(JSON.stringify({ version: 2, duration: 600, resolution: "4k", aspectRatio: "auto", outputFormat: "exe", bitrateMode: "ultra",
      marketing: { creativeFormat: "unknown", productDescription: "a".repeat(6000), audioMode: "alien", language: "unknown", voiceoverText: 123 } }));
    expect(restored).toMatchObject({ duration: 10, resolution: "720p", aspectRatio: "9:16", outputFormat: "mp4", bitrateMode: "standard",
      marketing: { creativeFormat: "product_showcase", audioMode: "silent", language: "fr", voiceoverText: "" } });
    expect(restored.marketing.productDescription).toHaveLength(5000);
  });
});
