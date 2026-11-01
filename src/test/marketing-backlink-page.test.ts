import { describe, expect, it, vi } from "vitest";
import { fetchPublicUrl } from "../../supabase/functions/_shared/safe-public-fetch";
import { readBacklinkPage } from "../../supabase/functions/_shared/marketing-backlink-page";
vi.mock("../../supabase/functions/_shared/auth.ts",()=>({HttpError:class extends Error{constructor(public status:number,msg:string){super(msg)}}}));
vi.mock("../../supabase/functions/_shared/safe-public-fetch.ts",()=>({fetchPublicUrl:vi.fn()}));
describe("partner HTML retrieval",()=>{
  it("reads a bounded HTML document with no credentials or redirects",async()=>{
    vi.mocked(fetchPublicUrl).mockResolvedValueOnce(new Response('<a href="https://www.thetok.ch/blog">TOK</a>',{headers:{"content-type":"text/html"}}));
    expect(await readBacklinkPage("https://partner.ch/")).toMatchObject({source:"https://partner.ch/",state:"read"});
    expect(fetchPublicUrl).toHaveBeenCalledWith("https://partner.ch/",expect.objectContaining({maxRedirects:0,timeoutMs:8000}));
  });
  it("distinguishes redirect from a lost backlink",async()=>{
    vi.mocked(fetchPublicUrl).mockRejectedValueOnce(new Error("redirect_limit"));
    expect(await readBacklinkPage("https://partner.ch/")).toMatchObject({state:"redirect"});
  });
  it("blocks TOK itself, oversized and non-HTML pages",async()=>{
    await expect(readBacklinkPage("https://www.thetok.ch/blog")).rejects.toThrow("invalid_external_source");
    vi.mocked(fetchPublicUrl).mockResolvedValueOnce(new Response("x".repeat(180001),{headers:{"content-type":"text/html"}}));
    await expect(readBacklinkPage("https://partner.ch/")).rejects.toThrow("source_too_large");
    vi.mocked(fetchPublicUrl).mockResolvedValueOnce(new Response("pdf",{headers:{"content-type":"application/pdf"}}));
    await expect(readBacklinkPage("https://partner.ch/")).rejects.toThrow("source_html_unavailable");
  });
});
