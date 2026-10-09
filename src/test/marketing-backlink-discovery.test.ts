import { describe, expect, it } from "vitest";
import { publicSourceUrl, verifiedBacklinkSources } from "../../supabase/functions/_shared/marketing-backlink-sources";

const source = { title: "Gastronomie locale", url: "https://food.ch/article", rationale: "Public local pertinent, règles à vérifier.", kind: "press" };
const search = { type: "web_search_call", status: "completed", action: { sources: [{ url: source.url }] } };

describe("backlink discovery evidence", () => {
  it("only retains exact evidenced URLs and derives domain itself", () => {
    expect(verifiedBacklinkSources({ output: [search] }, { sources: [
      { ...source, domain: "invented.ch" }, { ...source, url: "https://food.ch/invented" }, source,
    ] }, 5)).toMatchObject([{ ...source, domain: "food.ch", accountRequirement: "unknown" }]);
  });
  it("accepts actual citation annotations after a completed search", () => {
    const message = { type: "message", content: [{ annotations: [{ type: "url_citation", url: source.url }] }] };
    expect(verifiedBacklinkSources({ output: [{ ...search, action: {} }, message] }, { sources: [source] }, 5)).toHaveLength(1);
    expect(verifiedBacklinkSources({ output: [message] }, { sources: [source] }, 5)).toEqual([]);
  });
  it.each(["http://food.ch", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/", "https://x.local/", "https://localhost/", "https://u:p@food.ch/", "https://food.ch:8443/", "javascript:alert(1)"])("rejects unsafe source %s", (url) => {
    expect(publicSourceUrl(url)).toBeNull();
  });
  it("bounds the output and removes fragments from deduplication", () => {
    const second = { ...source, url: "https://food.ch/second" };
    const response = { output: [{ ...search, action: { sources: [source, second] } }] };
    expect(verifiedBacklinkSources(response, { sources: [source, { ...source, url: source.url + "#part" }, second] }, 1)).toHaveLength(1);
    expect(verifiedBacklinkSources(response, { sources: [source, { ...source, url: source.url + "#part" }, second] }, 5)).toHaveLength(2);
  });
  it("requires evidenced submission and explicit conditions for the without-account filter", () => {
    const open = { ...source, submissionUrl: source.url, evidenceUrl: source.url, accountEvidence: "Soumission sans inscription", accountRequirement: "none", publicationMode: "directory_review" };
    expect(verifiedBacklinkSources({ output: [search] }, { sources: [open] }, 5, true)).toMatchObject([{ accountRequirement: "none", publicationMode: "directory_review" }]);
    for (const candidate of [source, { ...open, evidenceUrl: "https://invented.ch/rules" }, { ...open, submissionUrl: "https://invented.ch/submit" }, { ...open, accountEvidence: "Un formulaire est visible" }, { ...open, accountRequirement: "required" }]) {
      expect(verifiedBacklinkSources({ output: [search] }, { sources: [candidate] }, 5, true)).toEqual([]);
    }
  });
});
