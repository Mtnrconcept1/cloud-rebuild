import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/integrations/supabase/client";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import {
  getTokVideoImagePath,
  uploadTokVideoImage,
  validateTokVideoImage,
  VIDEO_IMAGE_MAX_BYTES,
} from "@/lib/ai/tokVideoImageUpload";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/optimizedImages", () => ({ optimizeImageUpload: vi.fn(async (file: File) => file) }));

const restaurantId = "fe046974-2945-4cf5-89cb-9c52ff354b93";
const userId = "2e27851c-5301-48e5-a046-1b949b918e7d";

function imageFile(name = "carte.png", size = 16, type = "image/png") {
  return new File([new Uint8Array(size)], name, { type });
}

function createMockSupabase(input: { uploadError?: { message: string }; dbError?: { message: string }; user?: boolean } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: input.uploadError || null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: "https://assets.example/" + path } }));
  const single = vi.fn().mockResolvedValue({
    data: input.dbError ? null : { id: "img-1", media_url: "https://assets.example/image.webp", alt_text: "carte.png" },
    error: input.dbError || null,
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const fromStorage = vi.fn(() => ({ upload, getPublicUrl, remove }));
  vi.mocked(getSupabase).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: input.user === false ? null : { id: userId } }, error: null }) },
    storage: { from: fromStorage },
    from: vi.fn(() => ({ insert })),
  } as unknown as ReturnType<typeof getSupabase>);
  return { upload, remove, getPublicUrl, insert, fromStorage };
}

describe("Upload d'image Higgsfield", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(optimizeImageUpload).mockImplementation(async (file) => file);
  });

  it("accepte PNG/JPEG/WebP et rejette taille, type ou extension dangereuse", () => {
    expect(() => validateTokVideoImage(imageFile())).not.toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.webp", 16, "image/webp"))).not.toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.jpg", 16, "image/jpeg"))).not.toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.svg", 32, "image/svg+xml"))).toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.js.png"))).toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.png", VIDEO_IMAGE_MAX_BYTES + 1))).toThrow();
    expect(() => validateTokVideoImage(imageFile("visuel.jpg", 30, "image/png"))).toThrow();
  });

  it("enregistre dans le dossier du restaurant et référence le média sans crédits IA", async () => {
    const api = createMockSupabase();
    const file = imageFile();
    const result = await uploadTokVideoImage(restaurantId, file);
    expect(result).toMatchObject({ id: "img-1", alt_text: "carte.png" });
    expect(api.fromStorage).toHaveBeenCalledWith("restaurant-images");
    const path = api.upload.mock.calls[0]?.[0] as string;
    expect(path).toMatch(new RegExp(`^${restaurantId}/marketing-assets/${userId}/[a-f0-9-]{36}\\.png$`, "i"));
    expect(api.upload.mock.calls[0]?.[2]).toMatchObject({ contentType: "image/png", upsert: false });
    expect(api.insert).toHaveBeenCalledWith(expect.objectContaining({
      restaurant_id: restaurantId,
      media_type: "marketing_brand_visual",
      media_url: expect.stringContaining(restaurantId),
      storage_bucket: "restaurant-images",
      storage_path: path,
      uploaded_by: userId,
      is_cover: false,
    }));
  });

  it("supprime le fichier orphelin en cas d'échec d'insertion DB", async () => {
    const api = createMockSupabase({ dbError: { message: "row denied" } });
    await expect(uploadTokVideoImage(restaurantId, imageFile())).rejects.toThrow("associée");
    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.remove).toHaveBeenCalledWith([api.upload.mock.calls[0]?.[0]]);
  });

  it("preserves the original logo bytes, format and transparency without image optimization", async () => {
    const api = createMockSupabase(); const original = imageFile("logo.png");
    await uploadTokVideoImage(restaurantId, original, "logo");
    expect(optimizeImageUpload).not.toHaveBeenCalled();
    expect(api.upload.mock.calls[0][1]).toBe(original);
    expect(api.insert).toHaveBeenCalledWith(expect.objectContaining({ media_type: "marketing_logo", storage_bucket: "restaurant-images" }));
  });

  it("n'insère rien en DB après un rejet Storage et exige une session", async () => {
    const api = createMockSupabase({ uploadError: { message: "storage denied" } });
    await expect(uploadTokVideoImage(restaurantId, imageFile())).rejects.toThrow("storage denied");
    expect(api.insert).not.toHaveBeenCalled();
    const unauthenticated = createMockSupabase({ user: false });
    await expect(uploadTokVideoImage(restaurantId, imageFile())).rejects.toThrow("Reconnectez-vous");
    expect(unauthenticated.upload).not.toHaveBeenCalled();
  });

  it("refuse de construire un chemin avec extension non autorisée", () => {
    expect(() => getTokVideoImagePath(restaurantId, userId, "00000000-0000-0000-0000-000000000000", "image/svg+xml")).toThrow();
    expect(getTokVideoImagePath(restaurantId, userId, "00000000-0000-0000-0000-000000000000", "image/webp"))
      .toContain(restaurantId + "/marketing-assets/" + userId);
  });
});
