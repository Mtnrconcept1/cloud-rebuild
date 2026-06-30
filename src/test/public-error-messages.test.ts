import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  containsTechnicalBackendDetails,
  formatAiImageGenerationError,
  toPublicErrorMessage,
} from "@/lib/publicErrorMessages";

const TECHNICAL_VISIBLE_PATTERN = /supabase\.co|functions\/v1|Unauthorized|fonction Supabase|côté Supabase|ai-image-enhance/i;

describe("public error messages", () => {
  it("detects backend details that must not be shown in the UI", () => {
    expect(containsTechnicalBackendDetails("https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/ai-image-enhance")).toBe(true);
    expect(containsTechnicalBackendDetails("Photo trop lourde pour la retouche IA.")).toBe(false);
  });

  it("sanitizes Supabase function failures before display", () => {
    const message = formatAiImageGenerationError(
      new Error("https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/ai-image-enhance:1 Failed to load resource: 401 Unauthorized"),
    );

    expect(message).toBe("Votre session a expiré. Reconnectez-vous puis relancez la génération.");
    expect(message).not.toMatch(TECHNICAL_VISIBLE_PATTERN);
  });

  it("replaces generic backend details with a public fallback", () => {
    const message = toPublicErrorMessage(
      new Error("PostgREST schema cache error on Supabase table ai_generated_assets"),
      "Action impossible pour le moment.",
    );

    expect(message).toBe("Action impossible pour le moment.");
    expect(message).not.toMatch(TECHNICAL_VISIBLE_PATTERN);
  });

  it("keeps AI creation surfaces wired to public image error copy", () => {
    const sources = [
      "src/lib/ai/aiCreationJobs.ts",
      "src/components/dashboard/AiCreationsGallery.tsx",
      "src/components/dashboard/TokAiPhotoStudioV2.tsx",
      "src/components/dashboard/TokAiMarketingStudio.tsx",
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(sources).toContain("formatAiImageGenerationError");
    expect(sources).not.toMatch(/fonction Supabase|côté Supabase|ai-image-enhance n'est pas disponible/i);
  });

  it("distinguishes PhotoPro transient failures from source photo problems", () => {
    expect(formatAiImageGenerationError(new Error("image_edit_transient_failure"))).toContain("erreur temporaire");
    expect(formatAiImageGenerationError(new Error("image_edit_failed:500:server_error"))).toContain("erreur temporaire");
    expect(formatAiImageGenerationError(new Error("image_edit_timeout"))).toContain("pris trop de temps");
    expect(formatAiImageGenerationError(new Error("image_edit_failed:400:invalid_image"))).toContain("Recadrez le sujet principal");
    expect(formatAiImageGenerationError(new Error("image_edit_failed:400:content_policy"))).toContain("refusée par la sécurité");
  });
});
