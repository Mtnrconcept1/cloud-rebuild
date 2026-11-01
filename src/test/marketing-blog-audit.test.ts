import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlogPath, readTokBlogHtml } from "../../server/marketingBlogAudit";
import { auditBlogPage } from "@/marketing/growth/blogAudit";
const url="https://www.thetok.ch/blog/test";
afterEach(()=>vi.unstubAllGlobals());
describe("public TOK blog audit",()=>{
  it.each(["https://other.test/blog","/blog/../admin","//169.254.169.254","/blog?foo=1","/blog/u%2Fa","/admin"])("rejects non-blog targets",path=>expect(isBlogPath(path)).toBe(false));
  it("fetches the fixed origin without following a redirect",async()=>{
    const f=vi.fn(async()=>new Response(null,{status:302,headers:{location:"http://127.0.0.1"}}));
    vi.stubGlobal("fetch",f);const result=await readTokBlogHtml("/blog/test");
    expect(f).toHaveBeenCalledWith(url,expect.objectContaining({redirect:"manual"}));
    expect(result).toMatchObject({status:302,html:null});
  });
  it("checks content, indexing and schema without executing the fetched page",()=>{
    const html='<title>Guide</title><meta name="description" content="Guide TOK"><link rel="canonical" href="'+url+'"><h1>Guide</h1><img alt=""><script type="application/ld+json">{"@graph":[{"@type":"BlogPosting"}]}</script><script>throw Error("should not run")</script>';
    const meta={url,checkedAt:"2026-11-01",status:200,robotsHeader:null,html};
    expect(auditBlogPage(meta).every(f=>f.ok)).toBe(true);
    const bad=auditBlogPage({...meta,robotsHeader:"noindex",html:html.replace("BlogPosting","Other").replace('alt=""',"")});
    expect(bad.filter(f=>!f.ok).map(f=>f.label)).toEqual(["Directives d’indexation","Alternatives des images","Données structurées"]);
  });
});
