import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TokVideoAiPanel from "@/components/dashboard/TokVideoAiPanel";
import { mergeTokVideoJobs, type TokVideoJob } from "@/lib/ai/tokVideoClient";

const mocks = vi.hoisted(() => ({ request: vi.fn(), validate: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/ai/tokVideoClient", async (original) => ({ ...await original<typeof import("@/lib/ai/tokVideoClient")>(), requestTokVideo: mocks.request }));
vi.mock("@/lib/media/validateRestaurantReel", () => ({ validatePreparedRestaurantReel: mocks.validate }));
const quote = { credits: 417, maxChargedChf: 3.75, estimatedProviderChf: 3.74, model: "bytedance/seedance-2.5/reference-to-video" };
const job: TokVideoJob = { id: "job-1", status: "completed", prompt: "Photos choisies, zoom léger", duration: 10,
  resolution: "720p", aspectRatio: "9:16", generateAudio: false, credits: 417, model: quote.model,
  referenceMediaId: "photo-1", errorCode: null, createdAt: "2026-11-05T12:00:00Z", updatedAt: "2026-11-05T12:01:00Z",
  videoUrl: "https://storage.example/clip.mp4" };
const props = { restaurantId: "restaurant-a", photoIds: ["photo-1"], logoId: "logo-1", prompt: "Photos choisies, zoom léger" };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.request.mockImplementation(async (_id, request) => {
    if (request.action === "list") return { jobs: [] };
    if (request.action === "quote") return { quote };
    if (request.action === "start") return { job: { ...job, status: "queued" } };
    if (request.action === "status") return { job };
    throw new Error("Unexpected action");
  });
  mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new Blob(["fixture"], { type: "video/mp4" }) });
  mocks.validate.mockImplementation(async (file: File) => file);
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function approveVideo() {
  fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise une interprétation/ }));
  await approveNextVideo();
}
async function approveNextVideo() {
  const quoteButton = screen.getByRole("button", { name: "Obtenir le devis de l'animation" });
  await waitFor(() => expect(quoteButton).toBeEnabled());
  fireEvent.click(quoteButton);
  const startButton = await screen.findByRole("button", { name: "Confirmer et générer" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." }));
  fireEvent.click(startButton);
}

describe("paid reference animation", () => {
  it("submits once when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    render(<TokVideoAiPanel {...props} />);
    await approveVideo();
    await screen.findByRole("link", { name: "Ouvrir la vidéo" });
    expect(mocks.request.mock.calls.filter(([, input]) => input.action === "start")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("keeps a successful receipt and uses a fresh key even if local cleanup is refused", async () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    render(<TokVideoAiPanel {...props} />);
    await approveVideo();
    await screen.findByRole("link", { name: "Ouvrir la vidéo" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await approveNextVideo();
    await waitFor(() => expect(mocks.request.mock.calls.filter(([, input]) => input.action === "start")).toHaveLength(2));
    const starts = mocks.request.mock.calls.filter(([, input]) => input.action === "start");
    expect(starts[1][1].idempotencyKey).not.toBe(starts[0][1].idempotencyKey);
  });
  it("retains the same key for an unresolved lost start response, including without storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota full", "QuotaExceededError"); });
    mocks.request.mockImplementation(async (_id, request) => {
      if (request.action === "list") return { jobs: [] };
      if (request.action === "quote") return { quote };
      throw new Error("Response lost");
    });
    render(<TokVideoAiPanel {...props} />);
    await approveVideo();
    await screen.findByRole("alert");
    await approveNextVideo();
    await waitFor(() => expect(mocks.request.mock.calls.filter(([, input]) => input.action === "start")).toHaveLength(2));
    const starts = mocks.request.mock.calls.filter(([, input]) => input.action === "start");
    expect(starts[1][1].idempotencyKey).toBe(starts[0][1].idempotencyKey);
  });
  it("reconciles a stored pending key with the history receipt after a reload", async () => {
    const pendingKey = "tok:video-studio:pending:" + props.restaurantId;
    localStorage.setItem(pendingKey, JSON.stringify({ key: "lost-response-key", signature: "previous input" }));
    mocks.request.mockImplementation(async (_id, request) => request.action === "list"
      ? { jobs: [{ ...job, idempotencyKey: "lost-response-key" }] } : { quote });
    render(<TokVideoAiPanel {...props} />);
    await screen.findByRole("link", { name: "Ouvrir la vidéo" });
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(mocks.request.mock.calls.every(([, input]) => input.action === "list")).toBe(true);
  });
  it("does not let a late receipt erase a newer pending request after unmount", async () => {
    let finish!: (value: unknown) => void;
    mocks.request.mockImplementation(async (_id, request) => {
      if (request.action === "start") return new Promise((resolve) => { finish = resolve; });
      return request.action === "quote" ? { quote } : { jobs: [] };
    });
    const view = render(<TokVideoAiPanel {...props} />);
    await approveVideo(); view.unmount();
    const pendingKey = "tok:video-studio:pending:" + props.restaurantId;
    localStorage.setItem(pendingKey, JSON.stringify({ key: "newer-request-key", signature: "new input" }));
    await act(async () => { finish({ job }); });
    expect(JSON.parse(localStorage.getItem(pendingKey) || "null").key).toBe("newer-request-key");
  });
  it("requires interpretation and debit confirmation, sending the approved amount and model", async () => {
    render(<TokVideoAiPanel {...props} />);
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise une interprétation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Obtenir le devis de l'animation" }));
    const start = await screen.findByRole("button", { name: "Confirmer et générer" }); expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Je confirme le débit de 417 crédits." }));
    fireEvent.click(start); fireEvent.click(start);
    await waitFor(() => expect(mocks.request.mock.calls.filter(([, input]) => input.action === "start")).toHaveLength(1));
    expect(mocks.request).toHaveBeenCalledWith(props.restaurantId, expect.objectContaining({ action: "start", confirmedCredits: 417,
      confirmedModel: quote.model, generateAudio: false, referenceMediaIds: ["photo-1"], logoMediaId: "logo-1" }));
  });
  it("discards a quote arriving after the selected sources change", async () => {
    let resolve!: (value: unknown) => void;
    mocks.request.mockImplementation(async (_id, request) => request.action === "quote" ? new Promise((done) => { resolve = done; }) : { jobs: [] });
    const view = render(<TokVideoAiPanel {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise une interprétation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Obtenir le devis de l'animation" }));
    view.rerender(<TokVideoAiPanel {...props} photoIds={["photo-2"]} />);
    await act(async () => { resolve({ quote }); });
    expect(screen.queryByRole("button", { name: "Confirmer et générer" })).not.toBeInTheDocument();
  });
  it("blocks a new paid request while an uncertain provider submission awaits review", async () => {
    mocks.request.mockResolvedValue({ jobs: [{ ...job, status: "needs_review", videoUrl: null }] });
    render(<TokVideoAiPanel {...props} />); await screen.findAllByText("Vérification nécessaire");
    fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise une interprétation/ }));
    expect(screen.getByRole("button", { name: "Obtenir le devis de l'animation" })).toBeDisabled();
    expect(mocks.request.mock.calls.some(([, input]) => input.action === "start")).toBe(false);
  });
  it("explains a confirmed provider access refusal without suggesting removal of references", async () => {
    mocks.request.mockResolvedValue({ jobs: [{ ...job, status: "failed", errorCode: "video_provider_access_denied", videoUrl: null }] });
    render(<TokVideoAiPanel {...props} />);
    expect(await screen.findByText(/Le support TOK doit vérifier les droits et le solde du compte API Higgsfield/)).toBeInTheDocument();
    expect(screen.queryByText(/sans référence/)).not.toBeInTheDocument();
    expect(mocks.request.mock.calls.some(([, input]) => input.action === "start")).toBe(false);
  });
  it("resumes an accepted provider job awaiting archiving without submitting or charging again", async () => {
    mocks.request.mockImplementation(async (_id, request) => request.action === "list"
      ? { jobs: [{ ...job, status: "needs_review", canRefreshStatus: true, videoUrl: null }] }
      : { job: { ...job, updatedAt: "2026-11-05T12:02:00Z" } });
    render(<TokVideoAiPanel {...props} />);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(props.restaurantId, { action: "status", jobId: job.id }));
    expect(await screen.findByRole("link", { name: "Ouvrir la vidéo" })).toBeInTheDocument();
    expect(mocks.request.mock.calls.every(([, input]) => input.action === "list" || input.action === "status")).toBe(true);
  });
  it("attaches only the reviewed, verified File and locks history during verification", async () => {
    mocks.request.mockImplementation(async (_id, request) => request.action === "list" ? { jobs: [job] } : { job });
    let finish!: (file: File) => void;
    mocks.validate.mockImplementation(() => new Promise<File>((resolve) => { finish = resolve; }));
    const attach = vi.fn(); render(<TokVideoAiPanel {...props} onUseVideo={attach} />);
    const button = await screen.findByRole("button", { name: "Ajouter au brouillon" }); expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /J'ai vérifié la vidéo/ }));
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Photos choisies, zoom léger/ })).toBeDisabled();
    expect(attach).not.toHaveBeenCalled();
    const file = mocks.validate.mock.calls[0][0] as File;
    await act(async () => { finish(file); });
    expect(attach).toHaveBeenCalledExactlyOnceWith(file);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not attach a downloaded file rejected by video validation", async () => {
    mocks.request.mockImplementation(async (_id, request) => request.action === "list" ? { jobs: [job] } : { job });
    mocks.validate.mockRejectedValue(new Error("La vidéo reçue est incomplète"));
    const attach = vi.fn(); render(<TokVideoAiPanel {...props} onUseVideo={attach} />);
    await screen.findByRole("button", { name: "Ajouter au brouillon" });
    fireEvent.click(screen.getByRole("checkbox", { name: /J'ai vérifié la vidéo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au brouillon" }));
    await screen.findByRole("alert"); expect(attach).not.toHaveBeenCalled();
  });
  it("retains newer and terminal job state when an earlier history response arrives", () => {
    const old = { ...job, status: "queued" as const, updatedAt: "2026-11-05T12:00:30Z" };
    expect(mergeTokVideoJobs([job], [old])).toEqual([job]);
    const other = { ...old, id: "job-2", createdAt: "2026-11-05T13:00:00Z" };
    expect(mergeTokVideoJobs([other], [job])).toEqual([other, job]);
  });
});
