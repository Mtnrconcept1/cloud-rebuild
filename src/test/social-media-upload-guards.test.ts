import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readMigrationsContaining(marker: string) {
  return readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => read(`supabase/migrations/${file}`))
    .filter((migration) => migration.includes(marker))
    .join("\n");
}

describe("social media upload guards", () => {
  it("uses explicit MIME allowlists before social media uploads and in the composer picker", () => {
    const uploadSecurity = read("src/lib/uploadSecurity.ts");
    const hook = read("src/hooks/useSocialFeed.ts");
    const composer = read("src/components/social/SocialComposer.tsx");

    expect(uploadSecurity).toContain("SOCIAL_MEDIA_ACCEPT");
    expect(uploadSecurity).toContain("MAX_SOCIAL_VIDEO_SOURCE_UPLOAD_BYTES");
    expect(uploadSecurity).toContain("assertSafeSocialMediaSourceFileUpload");
    const createPostSection = hook.slice(hook.indexOf("export function useCreateSocialPost"));
    expect(hook).toContain("optimizeSocialMediaUpload");
    expect(hook).toContain("prepareSocialPostMediaFiles(files)");
    expect(createPostSection.indexOf("prepareSocialPostMediaFiles(files)")).toBeLessThan(createPostSection.indexOf(".insert({"));
    expect(createPostSection).toContain("hidden_reason: \"Echec upload media\"");
    expect(composer).toContain("SOCIAL_MEDIA_ACCEPT");
    expect(composer).toContain("assertSafeSocialMediaSourceFileUpload");
    expect(composer).toContain("assertSafeSocialMediaSourceFileUpload");
    expect(composer).not.toContain("Compression auto");
    expect(composer).not.toContain('accept="image/*,video/*"');
  });

  it("keeps the Supabase social media bucket aligned with the frontend media limits", () => {
    const migrations = readMigrationsContaining("social_post_media_bucket_hardening");

    expect(migrations).toContain("social_post_media_bucket_hardening");
    expect(migrations).toContain("file_size_limit = 26214400");
    expect(migrations).toContain("allowed_mime_types = ARRAY[");
    expect(migrations).toContain("'image/jpeg'");
    expect(migrations).toContain("'image/png'");
    expect(migrations).toContain("'image/webp'");
    expect(migrations).toContain("'image/gif'");
    expect(migrations).toContain("'video/mp4'");
    expect(migrations).toContain("'video/webm'");
    expect(migrations).toContain("'video/quicktime'");
    expect(migrations).not.toContain("'image/svg+xml'");
  });
});
