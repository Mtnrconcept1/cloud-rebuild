import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryProofPanel from "@/components/courier/DeliveryProofPanel";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const getUserMedia = vi.fn();
const detect = vi.fn();
const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
let frame: FrameRequestCallback | undefined;

function mediaStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

async function startScan() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Scanner le QR" })); });
}

beforeEach(() => {
  frame = undefined;
  getUserMedia.mockReset();
  detect.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("BarcodeDetector", class {
    detect = detect;
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { frame = undefined; });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("courier proof camera", () => {
  it("requests video only after the courier clicks and releases every track on unmount", async () => {
    const camera = mediaStream();
    getUserMedia.mockResolvedValue(camera.stream);
    const onVerify = vi.fn();
    const { unmount } = render(<DeliveryProofPanel onVerify={onVerify} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    await startScan();
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: { facingMode: { ideal: "environment" } }, audio: false });
    expect(onVerify).not.toHaveBeenCalled();
    unmount();
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it("keeps manual proof available after the user refuses camera permission", async () => {
    getUserMedia.mockRejectedValue(new DOMException("Camera permission denied", "NotAllowedError"));
    const onVerify = vi.fn();
    render(<DeliveryProofPanel onVerify={onVerify} />);
    await startScan();
    expect(screen.getByText("Impossible d'acceder a la camera.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Signature manuelle" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Code client de secours"), { target: { value: "123456" } });
    expect(onVerify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Valider la livraison" }));
    expect(onVerify).toHaveBeenCalledExactlyOnceWith({ code: "123456", verificationMethod: "manual_code" });
  });

  it("offers the manual fallback without requesting a camera when QR detection is unsupported", () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    render(<DeliveryProofPanel onVerify={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Scanner le QR" })).toBeDisabled();
    expect(screen.getByText(/Cet appareil ne prend pas en charge/)).toBeInTheDocument();
    expect(screen.getByLabelText("Code client de secours")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Signature manuelle" })).toBeEnabled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it.each(["stop", "unmount"])("releases permission granted late after %s", async (action) => {
    const permission = deferred<MediaStream>();
    const camera = mediaStream();
    getUserMedia.mockReturnValue(permission.promise);
    const { unmount } = render(<DeliveryProofPanel onVerify={vi.fn()} />);
    await startScan();
    if (action === "stop") fireEvent.click(screen.getByRole("button", { name: "Arreter le scan" }));
    else unmount();
    await act(async () => { permission.resolve(camera.stream); });
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("ignores an old permission rejection after a new scan has started", async () => {
    const oldPermission = deferred<MediaStream>();
    const camera = mediaStream();
    getUserMedia.mockReturnValueOnce(oldPermission.promise).mockResolvedValueOnce(camera.stream);
    render(<DeliveryProofPanel onVerify={vi.fn()} />);
    await startScan();
    fireEvent.click(screen.getByRole("button", { name: "Arreter le scan" }));
    await startScan();
    await act(async () => { oldPermission.reject(new Error("Old permission denied")); });
    expect(screen.queryByText("Old permission denied")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arreter le scan" })).toBeInTheDocument();
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it("does not restart the frame loop when video playback settles after stop", async () => {
    const playback = deferred<void>();
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(playback.promise);
    const camera = mediaStream();
    getUserMedia.mockResolvedValue(camera.stream);
    render(<DeliveryProofPanel onVerify={vi.fn()} />);
    await startScan();
    fireEvent.click(screen.getByRole("button", { name: "Arreter le scan" }));
    await act(async () => { playback.resolve(); });
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it.each(["result", "error"])("ignores a detector %s arriving after stop", async (outcome) => {
    const detection = deferred<Array<{ rawValue: string }>>();
    detect.mockReturnValue(detection.promise);
    const camera = mediaStream();
    getUserMedia.mockResolvedValue(camera.stream);
    const onVerify = vi.fn();
    render(<DeliveryProofPanel onVerify={onVerify} />);
    await startScan();
    act(() => { frame?.(0); });
    expect(detect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Arreter le scan" }));
    await act(async () => {
      if (outcome === "result") detection.resolve([{ rawValue: "123456" }]);
      else detection.reject(new Error("Late detection"));
    });
    expect(screen.getByLabelText("Code client de secours")).toHaveValue("");
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(onVerify).not.toHaveBeenCalled();
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it("stops the camera after a QR match and requires explicit confirmation", async () => {
    detect.mockResolvedValue([{ rawValue: "123456" }]);
    const camera = mediaStream();
    getUserMedia.mockResolvedValue(camera.stream);
    const onVerify = vi.fn();
    render(<DeliveryProofPanel onVerify={onVerify} />);
    await startScan();
    await act(async () => { await frame?.(0); });
    expect(screen.getByLabelText("Code client de secours")).toHaveValue("123456");
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(onVerify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Valider la livraison" }));
    expect(onVerify).toHaveBeenCalledExactlyOnceWith({ code: "123456", verificationMethod: "qr" });
  });
});
