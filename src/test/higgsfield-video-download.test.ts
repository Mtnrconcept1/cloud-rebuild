// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readBoundedTokVideo, tokVideoOutputFileSpec } from "../../supabase/functions/_shared/higgsfield-video-download";

function container(format: "mp4" | "mov") {
  const bytes = new Uint8Array(24);
  new DataView(bytes.buffer).setUint32(0, 24);
  bytes.set(new TextEncoder().encode("ftyp"), 4);
  bytes.set(new TextEncoder().encode(format === "mov" ? "qt  " : "mp42"), 8);
  return bytes;
}

describe("bounded provider video archival", () => {
  it.each(["mp4", "mov"] as const)("keeps the requested %s container, extension and MIME coherent", async (format) => {
    const file = tokVideoOutputFileSpec(format);
    const source = container(format);
    const bytes = await readBoundedTokVideo(new Response(source, { headers: { "content-type": file.contentType } }), 100, format);
    expect(bytes).toEqual(source);
    expect(file.extension).toBe(format);
    expect(file.contentType).toBe(format === "mov" ? "video/quicktime" : "video/mp4");
  });

  it("preserves MP4 for existing jobs whose output format was not recorded", () => {
    expect(tokVideoOutputFileSpec(undefined)).toEqual({ format: "mp4", extension: "mp4", contentType: "video/mp4" });
    expect(() => tokVideoOutputFileSpec("webm")).toThrow("video_output_format_invalid");
  });

  it("cancels a body whose declared size already exceeds the limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    await expect(readBoundedTokVideo(new Response(stream, { headers: { "content-length": "101" } }), 100, "mp4"))
      .rejects.toThrow("video_file_too_large");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { "content-length": "24" }])("enforces the actual stream limit with missing or false size headers: %j", async (headers) => {
    let count = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        count += 1;
        if (count <= 50) controller.enqueue(new Uint8Array(24));
        else controller.close();
      },
      cancel,
    });
    await expect(readBoundedTokVideo(new Response(stream, { headers }), 48, "mp4"))
      .rejects.toThrow("video_file_too_large");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(count).toBeLessThan(10);
  });

  it("accepts a chunked generic binary response exactly at its byte limit", async () => {
    const source = container("mp4");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(source.slice(0, 7)); controller.enqueue(source.slice(7)); controller.close();
      },
    });
    expect(await readBoundedTokVideo(new Response(stream, { headers: { "content-type": "application/octet-stream" } }), 24, "mp4"))
      .toEqual(source);
  });

  it("does not archive an HTML/JSON error response or a truncated body as a completed video", async () => {
    await expect(readBoundedTokVideo(new Response("<html>expired link</html>", { headers: { "content-type": "text/html" } }), 100, "mp4"))
      .rejects.toThrow("video_download_invalid");
    await expect(readBoundedTokVideo(new Response(new TextEncoder().encode('{"error":"expired"}')), 100, "mp4"))
      .rejects.toThrow("video_download_invalid");
    await expect(readBoundedTokVideo(new Response(new Uint8Array(8)), 100, "mp4"))
      .rejects.toThrow("video_download_invalid");
  });

  it.each([["mp4", "mov"], ["mov", "mp4"]] as const)("rejects %s content when the reserved output was %s", async (actual, requested) => {
    await expect(readBoundedTokVideo(new Response(container(actual)), 100, requested))
      .rejects.toThrow("video_download_format_mismatch");
  });
});
