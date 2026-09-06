import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertSafePublicUrl,
  fetchPublicUrl,
} from "../../supabase/functions/_shared/safe-public-fetch";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("TOK AI image reference security", () => {
  it("downloads user-controlled image references only through a public-network safe fetcher", () => {
    const helper = readProjectFile("supabase/functions/_shared/safe-public-fetch.ts");
    const imageFunction = readProjectFile("supabase/functions/ai-image-enhance/index.ts");

    expect(helper).toContain("Deno.resolveDns");
    expect(helper).toContain("unsafe_or_private_host");
    expect(helper).toContain('redirect: "manual"');
    expect(helper).toContain("maxRedirects");
    expect(helper).toContain('host === "localhost"');
    expect(helper).toContain('host.endsWith(".local")');
    expect(helper).toContain('host.endsWith(".internal")');
    expect(helper).toContain('normalized.startsWith("::ffff:")');
    expect(helper).not.toContain("dnsSafetyCache");

    expect(imageFunction).toContain('from "../_shared/safe-public-fetch.ts"');
    expect(imageFunction).toContain("fetchPublicUrl");
    expect(imageFunction).toContain("source_image_unsafe_url");
  });

  it("rejects direct private-network targets and private redirect destinations", async () => {
    await expect(assertSafePublicUrl("http://127.0.0.1/image.png")).rejects.toThrow("unsafe_or_private_host");
    await expect(assertSafePublicUrl("http://localhost/image.png")).rejects.toThrow("unsafe_or_private_host");
    await expect(assertSafePublicUrl("http://[::1]/image.png")).rejects.toThrow("unsafe_or_private_host");
    await expect(assertSafePublicUrl("http://[::ffff:7f00:1]/image.png")).rejects.toThrow("unsafe_or_private_host");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal-image.png" },
    }));

    try {
      await expect(fetchPublicUrl("https://93.184.216.34/image.png")).rejects.toThrow("unsafe_or_private_host");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("binds PhotoPro style references to current restaurant media when media IDs are supplied", () => {
    const imageFunction = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const photoStudio = readProjectFile("src/components/dashboard/TokAiPhotoStudioV2.tsx");

    expect(photoStudio).toContain("referenceImageUrls: styleReferenceImageUrl ? [styleReferenceImageUrl] : []");
    expect(photoStudio).toContain("referenceMediaIds: styleReferenceMediaId ? [styleReferenceMediaId] : []");
    expect(photoStudio).toContain("buildPhotoProPrompt(draft.userInstructions || \"\", Boolean(styleReferenceImageUrl))");
    expect(photoStudio).toContain("generationSeed: generationSeed || null");

    expect(imageFunction).toContain("resolveCurrentPhotoStyleReferences");
    expect(imageFunction).toContain("photo_style_reference_mismatch");
    expect(imageFunction).toContain("photo_style_reference_ids");
    expect(imageFunction).toContain("server_current_restaurant_media");
    expect(imageFunction).toContain("[sourceImageUrl, ...referenceImageUrls]");
    expect(imageFunction).toContain("Utilise les images de style uniquement");
    expect(imageFunction).toContain("appendGenerationSeedToPrompt");
  });
});
