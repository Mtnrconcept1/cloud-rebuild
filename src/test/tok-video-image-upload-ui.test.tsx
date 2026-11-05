import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TokAiVideoStudio from "@/components/dashboard/TokAiVideoStudio";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  uploadImage: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/ai/tokVideoClient", () => ({ requestTokVideo: mocks.request }));
vi.mock("@/lib/ai/tokVideoImageUpload", () => ({
  VIDEO_IMAGE_ACCEPT: "image/jpeg,image/png,image/webp",
  uploadTokVideoImage: mocks.uploadImage,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.order = () => query;
      query.limit = () => Promise.resolve({ data: [], error: null });
      return query;
    },
  }),
}));

const restaurantId = "fe046974-2945-4cf5-89cb-9c52ff354b93";

beforeEach(() => {
  mocks.request.mockReset();
  mocks.uploadImage.mockReset();
  mocks.toast.mockClear();
  mocks.request.mockResolvedValue({ jobs: [] });
});
afterEach(cleanup);

describe("Bloc d'import vidéo Higgsfield", () => {
  it("affiche un bloc adapté mobile avec types, taille et sélection de fichier", () => {
    render(<TokAiVideoStudio restaurantId={restaurantId} />);
    expect(screen.getByRole("group", { name: "Importer une image de référence" })).toBeVisible();
    const input = screen.getByLabelText("Choisir une image JPEG, PNG ou WebP");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(screen.getByText(/10 Mo maximum/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choisir une image" })).toBeEnabled();
  });

  it("sélectionne automatiquement l'image importée et permet de la retirer sans génération IA", async () => {
    mocks.uploadImage.mockResolvedValue({
      id: "nouvelle-image",
      media_url: "https://assets.example/visuel.webp",
      alt_text: "visuel.webp",
    });
    render(<TokAiVideoStudio restaurantId={restaurantId} />);
    const input = screen.getByLabelText("Choisir une image JPEG, PNG ou WebP");
    fireEvent.change(input, {
      target: { files: [new File(["image"], "visuel.webp", { type: "image/webp" })] },
    });
    await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Image sélectionnée")).toBeVisible());
    expect(screen.getByRole("combobox", { name: "Photo de référence (facultative)" })).toHaveValue("nouvelle-image");
    expect(screen.getByRole("img", { name: "Image de référence sélectionnée" })).toHaveAttribute(
      "src", "https://assets.example/visuel.webp",
    );
    expect(mocks.request).not.toHaveBeenCalledWith(restaurantId, expect.objectContaining({ action: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "Retirer l'image de référence" }));
    expect(screen.getByRole("combobox", { name: "Photo de référence (facultative)" })).toHaveValue("");
  });

  it("affiche l'erreur d'upload et préserve la sélection initiale", async () => {
    mocks.uploadImage.mockRejectedValue(new Error("Import de l'image impossible"));
    render(<TokAiVideoStudio restaurantId={restaurantId} />);
    fireEvent.change(screen.getByLabelText("Choisir une image JPEG, PNG ou WebP"), {
      target: { files: [new File(["image"], "photo.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Import de l'image impossible"));
    expect(screen.getByRole("combobox", { name: "Photo de référence (facultative)" })).toHaveValue("");
    expect(mocks.request).not.toHaveBeenCalledWith(restaurantId, expect.objectContaining({ action: "start" }));
  });
});
