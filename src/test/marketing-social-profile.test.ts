import { describe, expect, it } from "vitest";
import {
  canonicalizeSocialProfileUrl,
  extractSocialProfilesFromHtml,
  extractSocialWebsiteLinks,
} from "../../supabase/functions/_shared/marketing-social-profile";

describe("restaurant social profile URLs", () => {
  it.each([
    ["instagram.com/La_Table.99?igsh=tracking#bio", "instagram", "la_table.99", "https://www.instagram.com/la_table.99/"],
    ["//www.instagram.com/_table_/", "instagram", "_table_", "https://www.instagram.com/_table_/"],
    ["http://instagram.com/a/", "instagram", "a", "https://www.instagram.com/a/"],
    ["https://m.facebook.com/La.Table?locale=fr_CH", "facebook", "slug:la.table", "https://www.facebook.com/la.table/"],
    ["https://web.facebook.com/profile.php?id=100063123456789&amp;ref=footer", "facebook", "id:100063123456789", "https://www.facebook.com/profile.php?id=100063123456789"],
    ["https://www.facebook.com/people/La-Table/100063123456789/", "facebook", "id:100063123456789", "https://www.facebook.com/profile.php?id=100063123456789"],
    ["https://www.facebook.com/pages/La-Table/12345/", "facebook", "id:12345", "https://www.facebook.com/profile.php?id=12345"],
    ["facebook.com/100063123456789", "facebook", "id:100063123456789", "https://www.facebook.com/profile.php?id=100063123456789"],
  ])("canonicalizes a profile and removes tracking: %s", (input, platform, canonicalKey, url) => {
    expect(canonicalizeSocialProfileUrl(input)).toEqual({ platform, canonicalKey, url });
  });

  it.each([
    "https://www.instagram.com/p/ABC123/", "https://www.instagram.com/reel/ABC123/",
    "https://www.instagram.com/stories/table/12345/", "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com/explore/", "https://www.instagram.com/direct/",
    "https://www.instagram.com/table..bar/", "https://www.instagram.com/.table/", "https://www.instagram.com/table./",
    "https://www.instagram.com/" + "a".repeat(31), "https://www.instagram.com/%74able/",
    "https://www.facebook.com/sharer.php?u=https://restaurant.example/", "https://www.facebook.com/share/abc/",
    "https://www.facebook.com/plugins/page.php?href=table", "https://www.facebook.com/dialog/",
    "https://www.facebook.com/table/posts/12345", "https://www.facebook.com/table?story_fbid=12345",
    "https://www.facebook.com/table?fbid=12345", "https://www.facebook.com/table?v=12345",
    "https://www.facebook.com/profile.php?id=12345&id=23456", "https://www.facebook.com/profile.php?id=1234",
    "https://www.facebook.com/profile.php?id=012345", "https://www.facebook.com/1234",
    "https://www.facebook.com/" + "1".repeat(33), "https://www.facebook.com/La-Table",
    "https://www.facebook.com/La_Table", "https://www.facebook.com/" + "a".repeat(101),
    "https://www.facebook.com/groups/12345", "https://www.facebook.com/watch/",
    "https://instagram.com.attacker.example/table/", "https://attacker.example/?url=https://instagram.com/table/",
    "https://www.instagram.com@attacker.example/table/", "https://user:pass@www.instagram.com/table/",
    "https://www.instagram.com:8443/table/", "https://www.instagram.com\\@attacker.example/table/",
    "https://www.instagram.com/table\nbar/", "javascript:alert(1)", "data:text/html,instagram.com/table/",
    "https://l.instagram.com/?u=https://instagram.com/table/", "https://fb.me/table", "@table", "",
  ])("rejects non-profile, ambiguous or unsafe input: %s", (input) => {
    expect(canonicalizeSocialProfileUrl(input)).toBeNull();
  });

  it("checks the expected platform and handles unknown values without coercion", () => {
    expect(canonicalizeSocialProfileUrl("https://instagram.com/table/", "facebook")).toBeNull();
    for (const value of [null, undefined, 42, {}, ["instagram.com/table"]]) expect(canonicalizeSocialProfileUrl(value)).toBeNull();
  });

  it("keeps a profile candidate without claiming its identity, account type or privacy", () => {
    expect(canonicalizeSocialProfileUrl("https://facebook.com/people/Restaurant/100063123456789/")).toEqual({
      platform: "facebook", canonicalKey: "id:100063123456789", url: "https://www.facebook.com/profile.php?id=100063123456789",
    });
  });
});

describe("social evidence from public HTML", () => {
  it("extracts anchors and JSON-LD sameAs with canonical deduplication and source provenance", () => {
    const html = '<footer><a href="https://instagram.com/La_Table?igsh=foo" aria-label="Instagram">Notre <b>table</b></a>'
      + '<a href="https://www.instagram.com/la_table/">Doublon</a>'
      + '<a href="https://facebook.com/sharer.php?u=x">Partager</a></footer>'
      + '<script type="application/ld+json">{"@graph":[{"@type":"Restaurant","name":"La Table",'
      + '"sameAs":["https://m.facebook.com/La.Table/?ref=footer","https://instagram.com/LA_TABLE/"]}]}</script>';
    expect(extractSocialProfilesFromHtml(html, "https://restaurant.example/contact")).toEqual([
      { platform: "instagram", canonicalKey: "la_table", url: "https://www.instagram.com/la_table/", sourceUrl: "https://restaurant.example/contact", context: "Instagram Notre table" },
      { platform: "facebook", canonicalKey: "slug:la.table", url: "https://www.facebook.com/la.table/", sourceUrl: "https://restaurant.example/contact", context: "La Table" },
    ]);
  });

  it("never executes script data and ignores commented links, application code and malformed JSON", () => {
    const html = '<!-- <a href="https://instagram.com/commented/">Hidden</a> -->'
      + '<script>window.sideEffect = 1; `<a href="https://instagram.com/scriptfake/">fake</a>`</script>'
      + '<script type="application/ld+json">alert("do not execute")</script>'
      + '<!-- <script type="application/ld+json">{"sameAs":"https://instagram.com/hiddenjson/"}</script> -->'
      + '<a href="https://instagram.com/real/" title="Contact &#38; photos">Instagram</a>';
    expect(extractSocialProfilesFromHtml(html, "https://restaurant.example/")).toEqual([
      { platform: "instagram", canonicalKey: "real", url: "https://www.instagram.com/real/", sourceUrl: "https://restaurant.example/", context: "Contact & photos Instagram" },
    ]);
    expect((globalThis as Record<string, unknown>).sideEffect).toBeUndefined();
  });

  it("limits candidates and displayed context on oversized documents", () => {
    const html = Array.from({ length: 30 }, (_, i) => '<a href="https://instagram.com/table' + i + '/">' + "x".repeat(400) + '</a>').join("");
    const profiles = extractSocialProfilesFromHtml(html, "https://restaurant.example/");
    expect(profiles).toHaveLength(20);
    expect(profiles.every((profile) => profile.context.length <= 200)).toBe(true);
    expect(extractSocialProfilesFromHtml(" ".repeat(1_048_576) + '<a href="https://instagram.com/toolate/">IG</a>', "https://restaurant.example/")).toEqual([]);
  });

  it("selects only two useful same-origin pages and excludes authentication, documents and external sites", () => {
    const html = '<a href="/about">À propos</a><a href="/contact#email">Contact</a>'
      + '<a href="/restaurant">Restaurant</a><a href="https://elsewhere.example/contact">Other</a>'
      + '<a href="/contact.pdf">PDF</a><a href="/login/contact">Login</a><a href="/wp-admin/contact">Admin</a>'
      + '<a href="https://user:pass@restaurant.example/contact">Credentials</a>'
      + '<script>`<a href="/contact-fake">Fake</a>`</script>';
    expect(extractSocialWebsiteLinks(html, "https://restaurant.example/")).toEqual([
      "https://restaurant.example/contact", "https://restaurant.example/about",
    ]);
  });
});
