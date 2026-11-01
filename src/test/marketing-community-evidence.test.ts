import { describe, expect, it } from "vitest";
import { discussionId } from "@/marketing/growth/communityWatch";
import { findTokBacklink } from "@/marketing/growth/backlinkEvidence";
const source="https://partner.example/guide";
const target="https://www.thetok.ch/blog";
describe("community and backlink evidence",()=>{
  it("deduplicates discussions and rejects lookalike domains and listing pages",()=>{
    expect(discussionId("reddit","https://old.reddit.com/r/geneva/comments/abc12/topic/comment")).toBe("reddit:abc12");
    expect(discussionId("reddit","https://www.reddit.com/r/geneva/")).toBeNull();
    expect(discussionId("reddit","https://reddit.com.evil.example/r/g/comments/123")).toBeNull();
    expect(discussionId("quora","https://fr.quora.com/Une-question/answer/Marc")).toBe("fr.quora.com/Une-question");
    expect(discussionId("quora","https://www.quora.com/profile/Person")).toBeNull();
  });
  it("only counts real anchor hrefs resolving to the specified target",()=>{
    const found=findTokBacklink('<base href="https://www.thetok.ch/"><a href="blog#faq" rel="ugc nofollow">Mon guide</a>',source,target);
    expect(found).toEqual({kind:"ugc",rel:"ugc nofollow",anchor:"Mon guide"});
    expect(findTokBacklink('<script>const x=\'<a href="https://www.thetok.ch/blog">x</a>\'</script><a href="/blog">page externe</a>',source,target)).toBeNull();
    expect(()=>findTokBacklink("",source,"https://thetok.ch.evil.example/blog")).toThrow();
  });
});
