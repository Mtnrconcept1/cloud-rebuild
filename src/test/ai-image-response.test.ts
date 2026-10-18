import { describe, expect, it, vi } from "vitest";
import { decodeBoundedImageBase64, readBoundedImageBody, readBoundedImageJson } from "../../supabase/functions/_shared/ai-image-response";

describe("bounded AI image payloads", () => {
  it("rejects an oversized announced body before reading it", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "Content-Length": "100" } });
    await expect(readBoundedImageBody(response, 4)).rejects.toThrow("image_body_too_large");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([undefined, "1"])("bounds real streamed bytes despite Content-Length=%s", async length => {
    const cancel = vi.fn(); let pull=0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pull+=1; controller.enqueue(new Uint8Array(3)); }, cancel });
    const response = new Response(stream, { headers: length ? { "Content-Length": length } : {} });
    await expect(readBoundedImageBody(response, 5)).rejects.toThrow("image_body_too_large");
    expect(cancel).toHaveBeenCalledOnce(); expect(pull).toBeLessThanOrEqual(4);
  });
  it("accepts an exact-sized body and preserves all bytes", async () => {
    const bytes = new Uint8Array([0,1,127,255]);
    expect(await readBoundedImageBody(new Response(bytes), 4)).toEqual(bytes);
  });
  it("bounds a stalled body even if cancellation never resolves", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream({ cancel }));
    await expect(readBoundedImageBody(response, 10, 10)).rejects.toThrow("image_body_timeout");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("parses bounded JSON and rejects an incomplete provider document", async () => {
    expect(await readBoundedImageJson(new Response('{"data":[]}'))).toEqual({ data: [] });
    await expect(readBoundedImageJson(new Response('{"data":'))).rejects.toThrow("image_invalid_payload");
  });
  it("rejects oversized base64 before allocating the decoded image", () => {
    const atob = vi.spyOn(globalThis, "atob");
    expect(() => decodeBoundedImageBase64("A".repeat(12), 4)).toThrow("image_body_too_large");
    expect(atob).not.toHaveBeenCalled(); atob.mockRestore();
  });
  it.each(["", "a===", "YQ=", "YQ===", "Y=Q=", "Y Q=", "YQ_="])("rejects malformed base64 %s", value => {
    expect(() => decodeBoundedImageBase64(value, 100)).toThrow("image_invalid_payload");
  });
  it("accounts for padding and decoded size exactly", () => {
    expect(decodeBoundedImageBase64("YQ==", 1)).toEqual(new Uint8Array([97]));
    expect(decodeBoundedImageBase64("YWJj", 3)).toEqual(new Uint8Array([97,98,99]));
    expect(() => decodeBoundedImageBase64("YWJj", 2)).toThrow("image_body_too_large");
  });
});
