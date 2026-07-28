// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTokDishImage = vi.hoisted(() => vi.fn());
const getCommercialDemoAiRuntime = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/tokAiClient", () => ({ generateTokDishImage }));
vi.mock("@/lib/commercialDemoAi", () => ({ getCommercialDemoAiRuntime }));
vi.mock("@/lib/publicErrorMessages", () => ({
  formatAiImageGenerationError: (error: unknown) => String(error),
}));

import { startTokImageCreationJob } from "@/lib/ai/aiCreationJobs";
import type { TokImageGenerationResult } from "@/lib/ai/tokAiClient";

const sessionId = "efc018a2-0c34-430c-9714-6edc91781af8";
const demoStorageKey = `tok-ai-creations-v1:commercial-demo:${sessionId}:restaurant`;

const result: TokImageGenerationResult = {
  title: "Plat signature",
  enhanced_prompt: "Un plat signature en lumière éditoriale",
  edit_instructions: "",
  alt_text: "Plat signature TOK",
  publication_caption: "",
  checklist: [],
  style_tags: ["premium"],
  safety_notes: [],
  marketing_angles: [],
  assetId: "f330c691-864e-4942-90d5-3932c7f828d2",
  generated_image_url: "https://project.supabase.co/storage/v1/object/sign/commercial-demo-ai/output.webp?token=signed",
  gallery_image_url: "https://project.supabase.co/storage/v1/object/sign/commercial-demo-ai/gallery.webp?token=signed",
  storage_bucket: "commercial-demo-ai",
  storage_path: "output.webp",
  gallery_storage_bucket: null,
  gallery_storage_path: null,
  model: "gpt-image-2",
  generation_seed: "ad9cd82e-8790-4df2-b424-11e3f622f187",
  reference_folder: "",
  status: "stored",
};

describe("commercial demo AI creation storage scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    generateTokDishImage.mockReset();
    getCommercialDemoAiRuntime.mockReset();
  });

  it("keeps a late completion in its captured demo session after the frame closes", async () => {
    let complete!: (value: TokImageGenerationResult) => void;
    generateTokDishImage.mockReturnValueOnce(new Promise<TokImageGenerationResult>((resolve) => {
      complete = resolve;
    }));
    getCommercialDemoAiRuntime.mockReturnValue({ sessionId, surface: "restaurant" });

    const { promise } = startTokImageCreationJob({
      restaurantId: "8d490d7f-469d-49d2-baa9-ec10f9aaf694",
      tool: "photo_studio",
      title: "Plat signature",
      request: {
        restaurantId: "8d490d7f-469d-49d2-baa9-ec10f9aaf694",
        prompt: "Un plat signature en lumière éditoriale",
      },
    });

    expect(JSON.parse(window.localStorage.getItem(demoStorageKey) || "[]")[0].status).toBe("running");

    // The commercial iframe/provider can disappear while OpenAI is still working.
    getCommercialDemoAiRuntime.mockReturnValue(null);
    complete(result);
    await promise;

    expect(window.localStorage.getItem("tok-ai-creations-v1")).toBeNull();
    const [stored] = JSON.parse(window.localStorage.getItem(demoStorageKey) || "[]");
    expect(stored.status).toBe("completed");
    expect(stored.result.generated_image_url).toBeNull();
    expect(stored.result.gallery_image_url).toBeNull();
  });
});
