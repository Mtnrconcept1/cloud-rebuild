import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

function readMigration(fragment: string) {
  const migration = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.includes(fragment))
    .sort()
    .at(-1);

  expect(migration, `Missing migration containing ${fragment}`).toBeTruthy();
  return readFileSync(resolve(MIGRATIONS_DIR, migration!), "utf8");
}

describe("Actualites personalized feed SQL", () => {
  it("adds a saved scope backed by social_post_saves", () => {
    const sql = readMigration("actualites_saved_feed_and_personal_recommendations");

    expect(sql).toContain("p_scope IN ('for_you', 'followed', 'nearby', 'offers', 'saved')");
    expect(sql).toContain("p.scope = 'saved'");
    expect(sql).toContain("FROM public.social_post_saves saved");
    expect(sql).toContain("saved.post_id = a.post_id");
    expect(sql).toContain("saved.user_id = v.uid");
  });

  it("scores posts with personal interests, proximity, engagement and sponsorship", () => {
    const sql = readMigration("actualites_saved_feed_and_personal_recommendations");

    expect(sql).toContain("user_interest_signals");
    expect(sql).toContain("personal_interest_component");
    expect(sql).toContain("proximity_component");
    expect(sql).toContain("engagement_component");
    expect(sql).toContain("sponsored_component");
    expect(sql).toContain("0.40 *");
    expect(sql).toContain("0.25 *");
    expect(sql).toContain("0.20 *");
    expect(sql).toContain("0.15 *");
  });

  it("uses explicit plus and minus feedback as recommendation signals", () => {
    const sql = readMigration("actualites_saved_feed_and_personal_recommendations");

    expect(sql).toContain("WHEN ff.feedback_type = 'show_more' THEN 20");
    expect(sql).toContain("WHEN ff.feedback_type = 'not_interested' THEN -30");
    expect(sql).toContain("WHEN ff.feedback_type = 'hide_post' THEN -20");
    expect(sql).toContain("Plus comme ca");
    expect(sql).toContain("Selon vos gouts");
  });
});
