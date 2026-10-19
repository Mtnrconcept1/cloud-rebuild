import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingMailingImageUpload } from "@/components/marketing/MarketingMailingImageUpload";
import * as client from "@/marketing/marketingClient";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, marketingBffRequest: request }));

const id = "71830000-0000-4000-8000-000000000001";
const revision = "2026-10-19T08:00:00.123456+00:00";
const nextRevision = "2026-10-19T08:00:00.123457+00:00";
const visualUrl = "https://assets.example.test/manual.png";
const rawItem = () => ({ id, title: "E-mail 1", channel: "email", status: "draft", approval_status: "pending",
  scheduled_at: "2027-01-10T08:00:00Z", updated_at: nextRevision,
  content: { mailing_version: "tok-mailing-v1", subject: "Objet conservé", headline: "Titre conservé", body: "Texte conservé",
    call_to_action: "Découvrir", image_mode: "manual", visual_source: "upload", visual_status: "ready", visual_url: visualUrl,
    visual_width: 1200, visual_height: 1600 },
});
const response = () => ({ ok: true, item: rawItem(), visualUrl });
const file = () => new File(["synthetic-image"], "restaurant.png", { type: "image/png" });
class DecodedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 1600;
  set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
}
beforeEach(() => { request.mockReset(); request.mockResolvedValue(response()); vi.stubGlobal("Image", DecodedImage); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mailing image client", () => {
  it("decodes locally, sends prefix-free base64 and accepts a revision advanced by one microsecond", async () => {
    const signal = new AbortController().signal;
    const result = await client.uploadMarketingMailingImage(id, revision, file(), signal);
    expect(request).toHaveBeenCalledWith("/api/marketing/agent", { method: "POST", timeoutMs: 60_000, signal,
      body: { action: "upload_mailing_image", itemId: id, expectedUpdatedAt: revision, contentType: "image/png", imageBase64: btoa("synthetic-image") } });
    expect(result).toMatchObject({ id, content: "Texte conservé", visualUrl, updatedAt: nextRevision,
      postPreview: { imageMode: "manual", visualStatus: "ready", email: { subject: "Objet conservé" } } });
  });
  it.each([
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(client.MAX_MAILING_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }),
    new File(["fixture"], "image.webp", { type: "image/webp" }),
    new File(["fixture"], "image.svg", { type: "image/png" }),
  ])("rejects unsupported files before network: $name", async (invalid) => {
    await expect(client.uploadMarketingMailingImage(id, revision, invalid)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([["wrong-id", revision], [id, ""], [id, "not-a-date"]])("requires a saved identity and revision", async (itemId, timestamp) => {
    await expect(client.uploadMarketingMailingImage(itemId, timestamp, file())).rejects.toThrow("Actualisez");
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects undecodable content even when MIME and extension claim PNG", async () => {
    vi.stubGlobal("Image", class extends DecodedImage { set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); } });
    await expect(client.uploadMarketingMailingImage(id, revision, file())).rejects.toThrow("image JPG ou PNG valide");
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects an image with zero dimensions before network", async () => {
    vi.stubGlobal("Image", class extends DecodedImage { naturalWidth = 0; });
    await expect(client.uploadMarketingMailingImage(id, revision, file())).rejects.toThrow("dimensions");
    expect(request).not.toHaveBeenCalled();
  });
  it("honors cancellation before upload", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(client.uploadMarketingMailingImage(id, revision, file(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    { id: "71830000-0000-4000-8000-000000000002" }, { channel: "instagram" }, { updated_at: undefined },
    { updated_at: revision }, { updated_at: "2026-10-19T10:00:00.123456+02:00" },
    { content: { ...rawItem().content, image_mode: "generated" } },
    { content: { ...rawItem().content, visual_status: "pending_upload" } },
    { content: { ...rawItem().content, visual_source: "generated" } },
    { content: { ...rawItem().content, mailing_version: undefined } },
    { content: { ...rawItem().content, visual_url: "https://other.example.test/wrong.png" } },
  ])("rejects mismatched or stale saved-item responses: %j", async (invalid) => {
    request.mockResolvedValue({ ...response(), item: { ...rawItem(), ...invalid } });
    await expect(client.uploadMarketingMailingImage(id, revision, file())).rejects.toThrow("incomplète");
  });
  it("does not fabricate a mailing revision while keeping legacy normalization", () => {
    expect(client.normalizeCalendarItem({ ...rawItem(), updated_at: undefined }).updatedAt).toBe("");
    expect(client.normalizeCalendarItem({ content: "Legacy" }).updatedAt).not.toBe("");
  });
});

describe("per-email upload control", () => {
  const item = () => client.normalizeCalendarItem({ ...rawItem(), updated_at: revision, content: {
    ...rawItem().content, visual_url: null, visual_status: "pending_upload",
  } });
  it("updates only its own email and resets the file input for same-file retry", async () => {
    const onUploaded = vi.fn(); const onPendingChange = vi.fn();
    render(<MarketingMailingImageUpload item={item()} onUploaded={onUploaded} onPendingChange={onPendingChange} />);
    const input = screen.getByLabelText("Importer une image pour E-mail 1");
    fireEvent.change(input, { target: { files: [file()] } });
    await screen.findByText(/Image enregistrée/);
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ id, visualUrl }));
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
    expect(input).toHaveValue("");
    expect(screen.getByText(/sans recadrage/)).toBeInTheDocument();
  });
  it.each([
    { disabled: true }, { approvalStatus: "approved" as const }, { status: "scheduled" as const }, { updatedAt: "" },
  ])("disables import for noneditable mail: %j", (overrides) => {
    render(<MarketingMailingImageUpload item={{ ...item(), ...overrides }} disabled={overrides.disabled} onUploaded={vi.fn()} />);
    expect(screen.getByLabelText("Importer une image pour E-mail 1")).toBeDisabled();
  });
  it("keeps the existing image on a failed upload and allows retry of the same file", async () => {
    const upload = vi.spyOn(client, "uploadMarketingMailingImage").mockRejectedValueOnce(new Error("Réessayez l’import."))
      .mockResolvedValueOnce(client.normalizeCalendarItem(rawItem()));
    const onUploaded = vi.fn(); const original = client.normalizeCalendarItem({ ...rawItem(), updated_at: revision });
    render(<MarketingMailingImageUpload item={original} onUploaded={onUploaded} />);
    const input = screen.getByLabelText("Importer une image pour E-mail 1"); const chosen = file();
    fireEvent.change(input, { target: { files: [chosen] } });
    await screen.findByText("Réessayez l’import.");
    expect(onUploaded).not.toHaveBeenCalled(); expect(original.visualUrl).toBe(visualUrl);
    fireEvent.change(input, { target: { files: [chosen] } });
    await screen.findByText(/Image enregistrée/);
    expect(upload).toHaveBeenCalledTimes(2); expect(onUploaded).toHaveBeenCalledTimes(1);
  });
  it("prevents duplicate uploads while pending and cancels on unmount", async () => {
    const upload = vi.spyOn(client, "uploadMarketingMailingImage").mockReturnValue(new Promise(() => undefined));
    const onPendingChange = vi.fn();
    const { unmount } = render(<MarketingMailingImageUpload item={item()} onUploaded={vi.fn()} onPendingChange={onPendingChange} />);
    const input = screen.getByLabelText("Importer une image pour E-mail 1");
    fireEvent.change(input, { target: { files: [file()] } });
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { files: [file()] } });
    expect(upload).toHaveBeenCalledTimes(1);
    const signal = upload.mock.calls[0][3]!;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
  });
  it("cleans up the previous request when the item changes", async () => {
    const upload = vi.spyOn(client, "uploadMarketingMailingImage").mockReturnValue(new Promise(() => undefined));
    const onPendingChange = vi.fn(); const onUploaded = vi.fn();
    const { rerender } = render(<MarketingMailingImageUpload item={item()} onUploaded={onUploaded} onPendingChange={onPendingChange} />);
    fireEvent.change(screen.getByLabelText("Importer une image pour E-mail 1"), { target: { files: [file()] } });
    const signal = upload.mock.calls[0][3]!;
    rerender(<MarketingMailingImageUpload item={{ ...item(), id: "71830000-0000-4000-8000-000000000002", title: "E-mail 2" }} onUploaded={onUploaded} onPendingChange={onPendingChange} />);
    await waitFor(() => expect(screen.getByLabelText("Importer une image pour E-mail 2")).toBeEnabled());
    expect(signal.aborted).toBe(true);
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
  });
});
