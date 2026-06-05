import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readMigrations() {
  return readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => read(`supabase/migrations/${file}`))
    .join("\n");
}

describe("social media upload guards", () => {
  it("uses explicit MIME allowlists before social media uploads and in the composer picker", () => {
    const uploadSecurity = read("src/lib/uploadSecurity.ts");
    const hook = read("src/hooks/useSocialFeed.ts");
    const composer = read("src/components/social/SocialComposer.tsx");

    expect(uploadSecurity).toContain("SOCIAL_MEDIA_ACCEPT");
    const createPostSection = hook.slice(hook.indexOf("export function useCreateSocialPost"));
    expect(createPostSection).toContain("assertSocialPostMediaFiles(files)");
    expect(createPostSection.indexOf("assertSocialPostMediaFiles(files)")).toBeLessThan(createPostSection.indexOf(".insert({"));
    expect(composer).toContain("SOCIAL_MEDIA_ACCEPT");
    expect(composer).not.toContain('accept="image/*,video/*"');
  });

  it("keeps the Supabase social media bucket aligned with the frontend media limits", () => {
    const migrations = readMigrations();

    expect(migrations).toContain("20260605163000_social_post_media_bucket_hardening");
    expect(migrations).toContain("file_size_limit = 26214400");
    expect(migrations).toContain("allowed_mime_types = ARRAY[");
    expect(migrations).toContain("'image/jpeg'");
    expect(migrations).toContain("'image/png'");
    expect(migrations).toContain("'image/webp'");
    expect(migrations).toContain("'image/gif'");
    expect(migrations).not.toContain("'image/svg+xml'");
  });
});
