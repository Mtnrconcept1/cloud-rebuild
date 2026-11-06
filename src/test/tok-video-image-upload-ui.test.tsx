import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TokAiVideoStudio from "@/components/dashboard/TokAiVideoStudio";

const mocks = vi.hoisted(() => ({ request: vi.fn(), uploadImage: vi.fn(), loadMedia: vi.fn(), loadAssets: vi.fn(), draw: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/ai/tokVideoClient", async (original) => ({ ...await original<typeof import("@/lib/ai/tokVideoClient")>(), requestTokVideo: mocks.request }));
vi.mock("@/lib/ai/tokVideoBrandMedia", () => ({ loadTokVideoBrandMedia: mocks.loadMedia }));
vi.mock("@/lib/ai/tokVideoImageUpload", () => ({ VIDEO_IMAGE_ACCEPT: "image/jpeg,image/png,image/webp", uploadTokVideoImage: mocks.uploadImage }));
vi.mock("@/lib/media/restaurantReelRenderer", () => ({ loadReelAssets: mocks.loadAssets, drawReelFrame: mocks.draw, renderRestaurantReel: mocks.render }));
const restaurantId = "fe046974-2945-4cf5-89cb-9c52ff354b93";
const photo = { id: "photo-1", media_url: "https://assets.example/plat.jpg", alt_text: "Plat choisi", media_type: "photo" };
const logo = { id: "logo-1", media_url: "https://assets.example/logo.png", alt_text: "Logo du restaurant", media_type: "marketing_logo" };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.loadMedia.mockResolvedValue({ media: [photo, logo], hasMore: false });
  mocks.request.mockResolvedValue({ jobs: [] });
  mocks.loadAssets.mockImplementation(async () => ({ photos: [{}], logo: {}, close: vi.fn() }));
  mocks.render.mockResolvedValue(new File(["fixture-mp4"], "reel.mp4", { type: "video/mp4" }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:reel") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function selectReferences() {
  fireEvent.click(await screen.findByRole("button", { name: "Sélectionner Plat choisi" }));
  fireEvent.change(screen.getByLabelText("Logo du restaurant"), { target: { value: logo.id } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Créer mon reel de 10 secondes" })).toBeEnabled());
}
async function finishReel() {
  await selectReferences();
  fireEvent.click(screen.getByRole("button", { name: "Créer mon reel de 10 secondes" }));
  await screen.findByText("Votre reel est prêt");
  fireEvent.click(screen.getByRole("checkbox", { name: /J'ai vérifié mon reel/ }));
}

describe("restaurant reel studio", () => {
  it("starts with no selected sources and no paid generation; imports remain explicit", async () => {
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />);
    await screen.findByRole("button", { name: "Sélectionner Plat choisi" });
    expect(screen.queryByRole("list", { name: "Ordre des photos du reel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer mon reel de 10 secondes" })).toBeDisabled();
    expect(screen.getByLabelText("Choisir une image JPEG, PNG ou WebP")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(mocks.loadAssets).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("selects an explicitly imported image and lets the user remove it", async () => {
    mocks.uploadImage.mockResolvedValue({ ...photo, id: "uploaded", alt_text: "Import choisi" });
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />);
    fireEvent.change(screen.getByLabelText("Choisir une image JPEG, PNG ou WebP"), { target: { files: [new File(["image"], "visuel.webp", { type: "image/webp" })] } });
    const order = await screen.findByRole("list", { name: "Ordre des photos du reel" });
    expect(within(order).getByText("Import choisi")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retirer la photo 1" }));
    expect(screen.queryByRole("list", { name: "Ordre des photos du reel" })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps selected photos when an import fails", async () => {
    mocks.uploadImage.mockRejectedValue(new Error("Import de l'image impossible"));
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />); await selectReferences();
    fireEvent.change(screen.getByLabelText("Choisir une image JPEG, PNG ou WebP"), { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Import de l'image impossible"));
    expect(within(screen.getByRole("list", { name: "Ordre des photos du reel" })).getByText("Plat choisi")).toBeVisible();
  });
  it("restores acknowledged prompt and manual settings after reopening", async () => {
    const first = render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />); await selectReferences();
    fireEvent.change(screen.getByLabelText("Consignes artistiques"), { target: { value: "zoom avant" } });
    fireEvent.click(screen.getByRole("button", { name: "Appliquer les consignes au montage" }));
    fireEvent.change(screen.getByLabelText("Mouvement"), { target: { value: "zoom-out" } });
    first.unmount(); render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Créer mon reel de 10 secondes" })).toBeEnabled());
    expect(screen.getByLabelText("Mouvement")).toHaveValue("zoom-out");
  });
  it("isolates selected sources when switching restaurant", async () => {
    const view = render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />); await selectReferences();
    mocks.loadMedia.mockResolvedValue({ media: [], hasMore: false });
    view.rerender(<TokAiVideoStudio restaurantId="restaurant-b" mode="reel" />);
    await waitFor(() => expect(mocks.loadMedia).toHaveBeenCalledWith("restaurant-b", 0, []));
    expect(screen.queryByRole("list", { name: "Ordre des photos du reel" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reel final de 10 secondes")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tok:restaurant-reel:v1:" + restaurantId)!).photoIds).toEqual([photo.id]);
  });
  it.each(["sync", "async"])("handles %s attach rejection without losing the verified reel", async (kind) => {
    const attach = vi.fn(() => { if (kind === "sync") throw new Error("Ajout refusé"); return Promise.reject(new Error("Ajout refusé")); });
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" onUseVideo={attach} />); await finishReel();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au brouillon d'actualité" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ajout refusé"));
    expect(screen.getByRole("button", { name: "Ajouter au brouillon d'actualité" })).toBeEnabled();
    expect(screen.getByLabelText("Reel final de 10 secondes")).toBeInTheDocument();
  });
  it("requires review and locks attachment until the async callback completes", async () => {
    let complete!: () => void;
    const attach = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" onUseVideo={attach} />); await selectReferences();
    fireEvent.click(screen.getByRole("button", { name: "Créer mon reel de 10 secondes" })); await screen.findByText("Votre reel est prêt");
    expect(screen.getByRole("button", { name: "Ajouter au brouillon d'actualité" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /J'ai vérifié mon reel/ }));
    const button = screen.getByRole("button", { name: "Ajouter au brouillon d'actualité" });
    fireEvent.click(button); fireEvent.click(button); expect(attach).toHaveBeenCalledTimes(1);
    await act(async () => { complete(); });
    expect(screen.getByRole("button", { name: "Ajouter au brouillon d'actualité" })).toBeEnabled();
  });
  it("opens marketing with the AI controls and distinguishes source photos from a generated preview", async () => {
    render(<TokAiVideoStudio restaurantId={restaurantId} />);
    expect(await screen.findByRole("combobox", { name: "Style de publicité" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Animation IA" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Vos références")).toBeVisible();
    expect(screen.queryByText("Aperçu du montage fidèle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer mon reel de 10 secondes" })).not.toBeInTheDocument();
    expect(mocks.loadAssets).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.every(([, request]) => request.action === "list")).toBe(true);
  });
  it("restores the chosen creation mode separately for Marketing and Actualité", async () => {
    const first = render(<TokAiVideoStudio restaurantId={restaurantId} />);
    await screen.findByRole("combobox", { name: "Style de publicité" });
    fireEvent.click(screen.getByRole("button", { name: "Reel fidèle" }));
    first.unmount();
    const second = render(<TokAiVideoStudio restaurantId={restaurantId} />);
    await screen.findByRole("button", { name: "Sélectionner Plat choisi" });
    expect(screen.getByRole("button", { name: "Reel fidèle" })).toHaveAttribute("aria-pressed", "true");
    second.unmount();
    render(<TokAiVideoStudio restaurantId={restaurantId} mode="reel" />);
    await screen.findByRole("button", { name: "Sélectionner Plat choisi" });
    expect(screen.getByRole("button", { name: "Reel fidèle" })).toHaveAttribute("aria-pressed", "true");
  });
});
