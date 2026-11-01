const origin = "https://www.thetok.ch";
const maxBytes = 400_000;
export function isBlogPath(path: unknown): path is string {
  return typeof path === "string" && path.length <= 126 && /^\/blog(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path);
}
export async function readTokBlogHtml(path: string) {
  if (!isBlogPath(path)) throw new Error("invalid_path");
  const url = origin + path;
  const result = await fetch(url, { redirect:"manual", signal:AbortSignal.timeout(8000), cache:"no-store" });
  const meta = { url, checkedAt:new Date().toISOString(), status:result.status, robotsHeader:result.headers.get("x-robots-tag") };
  if (!result.ok || !result.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    await result.body?.cancel();
    return { ...meta, html:null };
  }
  const reader = result.body?.getReader();
  if (!reader) throw new Error("empty_body");
  const decoder = new TextDecoder();
  let html = "", size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("oversize"); }
      html += decoder.decode(value, {stream:true});
    }
  } finally { reader.releaseLock(); }
  return { ...meta, html:html + decoder.decode() };
}
