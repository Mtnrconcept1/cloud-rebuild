import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  decideImageTruth,
  extractOfficialImageCandidates,
  isSafePublicImageUrl,
} from "../../scripts/restaurant-image-truth-worker.mjs";

const migration = readFileSync(
  "supabase/migrations/20260904173000_restaurant_image_truth_pipeline.sql",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/restaurant-image-truth-backfill.yml",
  "utf8",
);
const worker = readFileSync(
  "scripts/restaurant-image-truth-worker.mjs",
  "utf8",
);

describe("restaurant image truth pipeline", () => {
  it("rejects private, local, credentialed and non-http image URLs", () => {
    for (const url of [
      "http://127.0.0.1/a.jpg",
      "http://localhost/a.jpg",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/a.jpg",
      "http://172.16.0.5/a.jpg",
      "http://192.168.1.5/a.jpg",
      "https://user:password@example.com/a.jpg",
      "file:///tmp/a.jpg",
      "data:image/png;base64,abc",
    ]) {
      expect(isSafePublicImageUrl(url)).toBe(false);
    }

    expect(isSafePublicImageUrl("https://restaurant.example/media/salle.webp")).toBe(true);
  });

  it("extracts official-page candidates and excludes icons, logos and tracking pixels", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/media/facade.webp" />
          <meta name="twitter:image" content="https://cdn.example.com/dining-room.jpg" />
          <script type="application/ld+json">
            {"@type":"Restaurant","image":["/media/terrasse.jpg"]}
          </script>
        </head>
        <body>
          <img src="/assets/logo.png" alt="Logo" />
          <img src="/media/chef-table.jpg" alt="Salle du restaurant" width="1200" height="800" />
          <img src="/pixel.gif" width="1" height="1" />
        </body>
      </html>
    `;

    const candidates = extractOfficialImageCandidates(
      html,
      "https://restaurant.example/notre-maison",
    );

    expect(candidates).toEqual([
      "https://restaurant.example/media/facade.webp",
      "https://restaurant.example/media/terrasse.jpg",
      "https://restaurant.example/media/chef-table.jpg",
      "https://cdn.example.com/dining-room.jpg",
    ]);
    expect(candidates.join(" ")).not.toMatch(/logo|pixel/i);
  });

  it("publishes only an exact, high-confidence restaurant match", () => {
    expect(
      decideImageTruth({
        exact_restaurant_match: true,
        depicts_real_venue: true,
        official_source_consistent: true,
        image_kind: "interior",
        confidence: 0.93,
        contradiction: false,
      }),
    ).toBe("verified");

    expect(
      decideImageTruth({
        exact_restaurant_match: false,
        depicts_real_venue: true,
        official_source_consistent: false,
        image_kind: "exterior",
        confidence: 0.98,
        contradiction: true,
      }),
    ).toBe("rejected");

    expect(
      decideImageTruth({
        exact_restaurant_match: true,
        depicts_real_venue: false,
        official_source_consistent: true,
        image_kind: "food",
        confidence: 0.9,
        contradiction: false,
      }),
    ).toBe("manual_review");

    for (const imageKind of ["logo", "menu", "map", "stock", "person", "unrelated"] as const) {
      expect(
        decideImageTruth({
          exact_restaurant_match: true,
          depicts_real_venue: false,
          official_source_consistent: true,
          image_kind: imageKind,
          confidence: 0.99,
          contradiction: false,
        }),
      ).toBe("rejected");
    }
  });

  it("uses additive RLS-protected queues and quarantines every future candidate", () => {
    for (const marker of [
      "CREATE TABLE IF NOT EXISTS public.restaurant_image_truth_reviews",
      "CREATE TABLE IF NOT EXISTS public.restaurant_image_discovery_jobs",
      "ALTER TABLE public.restaurant_image_truth_reviews ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.restaurant_image_discovery_jobs ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL ON public.restaurant_image_truth_reviews FROM PUBLIC, anon, authenticated",
      "REVOKE ALL ON public.restaurant_image_discovery_jobs FROM PUBLIC, anon, authenticated",
      "claim_restaurant_image_truth_reviews",
      "settle_restaurant_image_truth_review",
      "claim_restaurant_image_discovery_jobs",
      "settle_restaurant_image_discovery_job",
      "FOR UPDATE SKIP LOCKED",
      "tok.directory_image_truth_settling",
      "directory_image_verified",
      "directory_image_last_rejected_url",
      "trg_queue_directory_image_candidate",
    ]) {
      expect(migration).toContain(marker);
    }

    expect(migration).not.toMatch(/DELETE\s+FROM\s+(?:public\.)?restaurants/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });

  it("keeps downloads, model use and production batches bounded", () => {
    for (const marker of [
      "MAX_IMAGE_BYTES",
      "MAX_HTML_BYTES",
      "MAX_VERIFY_PER_RUN",
      "MAX_DISCOVERY_PER_RUN",
      "AbortSignal.timeout",
      "response_format",
      "json_schema",
      "gpt-4.1-mini",
      "manual_review",
      "OPENAI_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(worker).toContain(marker);
    }

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("max_rounds");
    expect(workflow).toContain("dry_run");
    expect(workflow).toContain("restaurant-image-truth-summary.json");
    expect(workflow).toContain("enrich-directory-images");
    expect(workflow).toContain("verify-directory-commercial-names");
    expect(workflow).not.toContain("pull_request_target");
  });
});
