import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeDeliveryProofCode } from "@/lib/deliveryProof";

type DeliveryProofPanelProps = {
  isLoading?: boolean;
  onVerify: (payload: { code: string; verificationMethod: "qr" | "manual_code" }) => void;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
  };
  getSupportedFormats?: () => Promise<string[]>;
};

export default function DeliveryProofPanel({ isLoading = false, onVerify }: DeliveryProofPanelProps) {
  const [code, setCode] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [detectedByScanner, setDetectedByScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef(0);

  const detectorCtor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  const qrScanSupported = Boolean(detectorCtor);

  const normalizedCode = useMemo(() => normalizeDeliveryProofCode(code), [code]);

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
        setScannerError("Le scan QR n'est pas disponible sur cet appareil. Utilisez le code manuel.");
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
                setScannerActive(false);
                return;
              }
            } catch {
              // Keep the scanner running. The courier still has manual fallback.
            }
          }

          animationFrameRef.current = window.requestAnimationFrame(scanFrame);
        };

        animationFrameRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : "Impossible d'acceder à la camera.");
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

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Preuve de livraison requise
        </p>
        <p className="text-sm text-muted-foreground">
          Scannez le QR du client ou saisissez son code a 6 chiffres avant de confirmer la remise.
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
          onClick={() => setScannerActive((current) => !current)}
          disabled={!qrScanSupported || isLoading}
        >
          <Camera className="mr-2 h-4 w-4" />
          {scannerActive ? "Arreter le scan" : "Scanner le QR"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="delivery-proof-code">Code client</Label>
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

      {scannerError ? (
        <p className="text-sm text-destructive">{scannerError}</p>
      ) : !qrScanSupported ? (
        <p className="text-sm text-muted-foreground">
          Cet appareil ne prend pas en charge le scan QR natif. Utilisez le code manuel du client.
        </p>
      ) : null}
    </div>
  );
}
