import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryProofPanel from "@/components/courier/DeliveryProofPanel";
import { ensureSeoMetadataForRoute } from "@/hooks/useSeoMeta";
const originalMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
function media(getUserMedia?: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: getUserMedia ? { getUserMedia } : undefined });
}
beforeEach(() => {
  vi.stubGlobal("BarcodeDetector", class { async detect() { return []; } });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalMedia) Object.defineProperty(navigator, "mediaDevices", originalMedia);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});
describe("camera fallback and resource lifecycle", () => {
  it("keeps manual code verification usable when the camera API is absent", async () => {
    media(); const verify = vi.fn(); render(<DeliveryProofPanel onVerify={verify} />);
    fireEvent.click(screen.getByRole("button", { name: "Scanner le QR" }));
    await screen.findByText(/caméra est indisponible/);
    fireEvent.change(screen.getByLabelText("Code client de secours"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider la livraison" }));
    expect(verify).toHaveBeenCalledWith({ code: "123456", verificationMethod: "manual_code" });
  });
  it("explains denied permission without exposing raw browser exception text", async () => {
    media(async () => { throw new DOMException("private browser error", "NotAllowedError"); });
    render(<DeliveryProofPanel onVerify={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Scanner le QR" }));
    await screen.findByText(/Accès caméra refusé/); expect(screen.queryByText("private browser error")).toBeNull();
  });
  it("stops an acquired camera track when scanning is stopped", async () => {
    const stop = vi.fn(); media(async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream);
    render(<DeliveryProofPanel onVerify={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Scanner le QR" }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Arreter le scan" }));
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });
  it("stops a late permission result after unmount instead of leaking the camera", async () => {
    let resolve!: (stream: MediaStream) => void; const stop = vi.fn();
    media(() => new Promise(r => { resolve = r; }));
    const view=render(<DeliveryProofPanel onVerify={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Scanner le QR" }));
    view.unmount(); resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });
});
for (const route of ["/parametres/securite", "/tok-connect/mcp-widget", "/coming-soon"]) {
  it(`assigns private metadata rather than Page introuvable to ${route}`, () => {
    document.head.innerHTML=""; delete document.head.dataset.tokSeoPath; delete document.head.dataset.tokSeoOwner;
    ensureSeoMetadataForRoute(route);
    expect(document.title).not.toContain("introuvable");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`https://www.thetok.ch${route}`);
  });
}
