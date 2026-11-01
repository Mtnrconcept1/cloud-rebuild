import { fetchPublicUrl } from "./safe-public-fetch.ts";
import { publicSourceUrl } from "./marketing-backlink-sources.ts";
import { HttpError } from "./auth.ts";

export async function readBacklinkPage(value: unknown) {
  const source = publicSourceUrl(value);
  if (!source || /(^|\.)thetok\.ch$/.test(new URL(source).hostname)) throw new HttpError(400,"invalid_external_source");
  const limit = 180000;
  const response = await fetchPublicUrl(source, { timeoutMs:8000, maxRedirects:0, init:{ headers:{ Accept:"text/html" } } }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "redirect_limit") return null;
    throw error;
  });
  if (!response) return { source, checkedAt:new Date().toISOString(), state:"redirect" as const };
  if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html") || !response.body) {
    await response.body?.cancel();
    throw new HttpError(422,"source_html_unavailable");
  }
  const reader = response.body.getReader();
  let size=0, html="";
  const decoder=new TextDecoder();
  try {
    for (;;) {
      const {done,value:chunk}=await reader.read();
      if (done) break;
      size+=chunk.byteLength;
      if(size>limit) { await reader.cancel(); throw new HttpError(422,"source_too_large"); }
      html+=decoder.decode(chunk,{stream:true});
    }
  } finally { reader.releaseLock(); }
  return { source, checkedAt:new Date().toISOString(), state:"read" as const, html:html+decoder.decode() };
}
