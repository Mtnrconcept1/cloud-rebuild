import { describe, expect, it } from "vitest";
import { approvedBlogEntry } from "@/marketing/growth/blogExport";
import type { GrowthArticle, GrowthRevision } from "@/marketing/growth/client";
import { renderBlogBody } from "@/lib/seo/blog.mjs";

const article: GrowthArticle = { id:"abc", slug:"test-publier", brief:"guide", version:7, approved_revision:2, current_revision:2, updated_at:"2026-11-01" };
const revision: GrowthRevision = { article_id:article.id, revision:2, profile_version:4, origin:"editor", created_at:"2026-11-01", document:{
  title:"Réserver à Genève", description:"Un guide pratique", language:"fr-CH", summary:"Introduction",
  sections:[{heading:"Choisir", paragraphs:["table ".repeat(655)], sourceIds:["tok"]}],
  faq:[], links:[{label:"Réserver",url:"https://www.thetok.ch/recherche"}],
  sources:[{id:"tok",title:"Site TOK",url:"https://www.thetok.ch/",checkedAt:"2026-11-01T10:00:00Z"}]
}};
describe("native blog export", () => {
  it("renders the approved native blocks, attribution and reviewed links", () => {
    const entry = approvedBlogEntry(article,revision,4,"2026-11-01");
    expect(entry.wordCount).toBeGreaterThanOrEqual(650);
    expect(entry.slug).toBe(article.slug);
    expect(renderBlogBody(entry.blocks)).toContain('href="/recherche"');
  });
  it.each([ [null,2,4], [1,2,4], [2,2,5] ])("refuses expired approval", (approved,current,profile) => {
    expect(() => approvedBlogEntry({...article, approved_revision:approved, current_revision:current},revision,profile!, "2026-11-01")).toThrow();
  });
  it("rejects embedded links that were not approved as structured links", () => {
    const dirty = {...revision,document:{...revision.document!,summary:"[externe](https://other.example)"}};
    expect(() => approvedBlogEntry(article,dirty,4,"2026-11-01")).toThrow(/liens Markdown/);
  });
});
