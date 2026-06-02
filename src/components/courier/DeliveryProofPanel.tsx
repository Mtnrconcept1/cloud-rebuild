import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Camera, Eraser, FileSignature, Loader2, ScanLine, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeDeliveryProofCode } from "@/lib/deliveryProof";
import type { DeliveryVerificationMethod } from "@/lib/courier";

type DeliveryProofPanelProps = {
  isLoading?: boolean;
  onVerify: (payload: {
    code?: string;
    signatureDataUrl?: string;
    verificationMethod: DeliveryVerificationMethod;
  }) => void;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
  };
  getSupportedFormats?: () => Promise<string[]>;
};

const SIGNATURE_WIDTH = 720;
const SIGNATURE_HEIGHT = 260;

export default function DeliveryProofPanel({ isLoading = false, onVerify }: DeliveryProofPanelProps) {
  const [code, setCode] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [detectedByScanner, setDetectedByScanner] = useState(false);
  const [signatureMode, setSignatureMode] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef(0);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const detectorCtor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  const qrScanSupported = Boolean(detectorCtor);

  const normalizedCode = useMemo(() => normalizeDeliveryProofCode(code), [code]);

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
    context.lineWidth = 5;
    setHasSignature(false);
  }, []);

  useEffect(() => {
    if (!scannerActive) {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      if (!detectorCtor) {
        setScannerError("Le scan QR n'est pas disponible sur cet appareil. Utilisez le code ou la signature manuelle.");
        setScannerActive(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => null);
        }

        const detector = new detectorCtor({ formats: ["qr_code"] });

        const scanFrame = async () => {
          if (cancelled || !videoRef.current) return;

          const now = Date.now();
          if (now - lastScanRef.current >= 500 && videoRef.current.readyState >= 2) {
            lastScanRef.current = now;
            try {
              const results = await detector.detect(videoRef.current);
              const rawValue = results[0]?.rawValue || "";
              const scannedCode = normalizeDeliveryProofCode(rawValue);
              if (scannedCode.length === 6) {
                setCode(scannedCode);
                setDetectedByScanner(true);
                setSignatureMode(false);
                setScannerActive(false);
                return;
              }
            } catch {
              // Keep the scanner running. The courier still has manual fallbacks.
            }
          }

          animationFrameRef.current = window.requestAnimationFrame(scanFrame);
        };

        animationFrameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : "Impossible d'acceder a la camera.");
        setScannerActive(false);
      }
    };

    setScannerError(null);
    startScanner();

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    };
  }, [detectorCtor, scannerActive]);

  useEffect(() => {
    if (!signatureMode) return;
    clearSignature();
  }, [clearSignature, signatureMode]);

  const getSignaturePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleSignaturePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getSignaturePoint(event);
    if (!canvas || !context || !point) return;

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const handleSignaturePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    const context = signatureCanvasRef.current?.getContext("2d");
    const point = getSignaturePoint(event);
    if (!context || !point) return;

    context.lineTo(point.x, point.y);
    context.stroke();
    setHasSignature(true);
  };

  const handleSignaturePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    drawingRef.current = false;
    canvas?.releasePointerCapture(event.pointerId);
  };

  const submitSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !hasSignature) return;

    onVerify({
      signatureDataUrl: canvas.toDataURL("image/png"),
      verificationMethod: "manual_signature",
    });
  };

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Preuve de livraison requise
        </p>
        <p className="text-sm text-muted-foreground">
          Scannez le QR du client. Si son telephone est indisponible, utilisez Signature manuelle.
        </p>
      </div>

      {scannerActive ? (
        <div className="overflow-hidden rounded-2xl border bg-background">
          <video ref={videoRef} className="aspect-video w-full bg-black object-cover" muted playsInline />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSignatureMode(false);
            setScannerActive((current) => !current);
          }}
          disabled={!qrScanSupported || isLoading}
        >
          <Camera className="mr-2 h-4 w-4" />
          {scannerActive ? "Arreter le scan" : "Scanner le QR"}
        </Button>
        <Button
          type="button"
          variant={signatureMode ? "default" : "outline"}
          onClick={() => {
            setScannerActive(false);
            setSignatureMode((current) => !current);
          }}
          disabled={isLoading}
        >
          <FileSignature className="mr-2 h-4 w-4" />
          Signature manuelle
        </Button>
      </div>

      {signatureMode ? (
        <div className="space-y-3 rounded-2xl border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Signature du client</p>
              <p className="text-xs text-muted-foreground">
                Le client signe ici avec son doigt, puis la livraison est validee.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={clearSignature} disabled={isLoading}>
              <Eraser className="mr-2 h-4 w-4" />
              Effacer
            </Button>
          </div>
          <canvas
            ref={signatureCanvasRef}
            width={SIGNATURE_WIDTH}
            height={SIGNATURE_HEIGHT}
            className="h-44 w-full touch-none rounded-xl border bg-white"
            onPointerDown={handleSignaturePointerDown}
            onPointerMove={handleSignaturePointerMove}
            onPointerUp={handleSignaturePointerUp}
            onPointerCancel={handleSignaturePointerUp}
          />
          <Button type="button" onClick={submitSignature} disabled={!hasSignature || isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
            Valider avec signature
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="delivery-proof-code">Code client de secours</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="delivery-proof-code"
              value={code}
              onChange={(event) => {
                setDetectedByScanner(false);
                setCode(normalizeDeliveryProofCode(event.target.value));
              }}
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              className="font-mono text-lg tracking-[0.35em]"
            />
            <Button
              type="button"
              onClick={() => onVerify({
                code: normalizedCode,
                verificationMethod: detectedByScanner ? "qr" : "manual_code",
              })}
              disabled={normalizedCode.length !== 6 || isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
              Valider la livraison
            </Button>
          </div>
        </div>
      )}

      {scannerError ? (
        <p className="text-sm text-destructive">{scannerError}</p>
      ) : !qrScanSupported ? (
        <p className="text-sm text-muted-foreground">
          Cet appareil ne prend pas en charge le scan QR natif. Utilisez le code client ou Signature manuelle.
        </p>
      ) : null}
    </div>
  );
}
