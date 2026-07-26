import { useRef, useState } from "react";
import {
  Bot,
  Camera,
  ImageUp,
  LayoutGrid,
  Lightbulb,
  Sofa,
  Trash2,
  Wand2,
  Send,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { AiLoadingState } from "@/components/ui/ai-loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSupabase } from "@/integrations/supabase/client";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { cn } from "@/lib/utils";

const supabase = getSupabase();
const MAX_IMPORT_IMAGE_BYTES = 6 * 1024 * 1024;
const IMPORT_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type AIFloorPlanTable = {
  table_number: string;
  capacity: number;
  kind: string;
  shape: "round" | "rect";
  seatType?: string;
  seatPlacements?: {
    zone: string;
    type: string;
    count: number;
    benchLength?: number;
    benchDepth?: number;
  }[];
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  seatLabels: number[];
};

export type AIFloorPlanResult = {
  tables: AIFloorPlanTable[];
  explanation: string;
  analysis?: Record<string, unknown>;
  source?: "generate" | "optimize" | "suggest-furniture" | "custom" | "image-import";
  variantName?: string;
};

type ImportImagePayload = {
  dataUrl: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
};

interface FloorPlanAIPanelProps {
  restaurantId: string;
  currentLayout: {
    table_number: string;
    capacity: number;
    layout: { x: number; y: number; w: number; h: number; shape: string; kind: string };
  }[];
  canvasWidth: number;
  canvasHeight: number;
  onApply: (result: AIFloorPlanResult) => void;
  disabled?: boolean;
}

const SUGGESTED_ACTIONS = [
  {
    id: "generate",
    label: "Générer un plan",
    description: "Crée un plan optimisé de A à Z",
    icon: LayoutGrid,
    color: "text-blue-500",
    bg: "bg-blue-500/10 hover:bg-blue-500/20",
  },
  {
    id: "optimize",
    label: "Optimiser le placement",
    description: "Améliore la disposition actuelle",
    icon: Wand2,
    color: "text-amber-500",
    bg: "bg-amber-500/10 hover:bg-amber-500/20",
  },
  {
    id: "suggest-furniture",
    label: "Suggérer du mobilier",
    description: "Plantes, bar, séparateurs...",
    icon: Sofa,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
  },
] as const;

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(1, Math.round(image.naturalHeight || image.height || 1)),
      });
    };
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

export default function FloorPlanAIPanel({
  restaurantId,
  currentLayout,
  canvasWidth,
  canvasHeight,
  onApply,
  disabled = false,
}: FloorPlanAIPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIFloorPlanResult | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [importImage, setImportImage] = useState<ImportImagePayload | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const callAI = async (action: AIFloorPlanResult["source"], prompt?: string, image?: ImportImagePayload | null) => {
  setLoading(true);
  setError(null);
  setResult(null);

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Non connecté");
    }

    const { data, error } = await supabase.functions.invoke("floorplan-ai", {
      body: {
        action,
        restaurantId,
        currentLayout,
        canvasWidth,
        canvasHeight,
        prompt,
        image: image || undefined,
      },
    });

    if (error) {
      throw new Error(error.message || "Erreur lors de l'appel à la fonction");
    }

    const aiData = data as AIFloorPlanResult;

    if (!aiData?.tables || !Array.isArray(aiData.tables)) {
      throw new Error("Réponse IA invalide");
    }

    setResult({
      ...aiData,
      source: action,
      variantName: action === "image-import" ? `Plan IA - ${new Date().toLocaleDateString("fr-CH")}` : undefined,
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : "Erreur inconnue");
  } finally {
    setLoading(false);
  }
};

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    callAI("custom", customPrompt.trim());
  };

  const handleImportImageChange = async (file: File | null) => {
    setError(null);
    setResult(null);
    setImportImage(null);
    if (!file) return;

    setPreparingImage(true);
    try {
      // A photo taken with a phone is routinely 3 to 8 MB, which used to be
      // rejected outright. Compressing first keeps the camera path usable and
      // shrinks what we upload to the vision model.
      let prepared = file;
      if (IMPORT_IMAGE_MIME_TYPES.has(file.type)) {
        prepared = await optimizeImageUpload(file).catch(() => file);
      }

      if (!IMPORT_IMAGE_MIME_TYPES.has(prepared.type)) {
        setError("Format non pris en charge. Utilisez une photo JPG, PNG ou WebP.");
        return;
      }

      if (prepared.size > MAX_IMPORT_IMAGE_BYTES) {
        setError("Image encore trop lourde après compression. Reprenez la photo à une résolution plus basse.");
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Lecture de l'image impossible"));
        reader.readAsDataURL(prepared);
      });
      const dimensions = await readImageDimensions(dataUrl);

      setImportImage({
        dataUrl,
        mimeType: prepared.type,
        name: prepared.name,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch {
      setError("Impossible de préparer cette image. Réessayez avec une autre photo.");
    } finally {
      setPreparingImage(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (loading || disabled || preparingImage) return;
    void handleImportImageChange(event.dataTransfer.files?.[0] || null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">Assistant IA</h3>
          <p className="text-[10px] text-muted-foreground">Powered by OpenAI</p>
        </div>
      </div>

      <div
        className={cn(
          "space-y-2 rounded-xl border p-3 transition-colors",
          dragActive
            ? "border-primary bg-primary/10"
            : "border-orange-200 bg-orange-50/70 dark:border-orange-900/40 dark:bg-orange-950/20",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!loading && !disabled && !preparingImage) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-start gap-2">
          <ImageUp className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-300" />
          <div>
            <p className="text-xs font-bold text-orange-950 dark:text-orange-100">Plan de salle automatique</p>
            <p className="text-[10px] leading-tight text-orange-800/80 dark:text-orange-200/80">
              Photographiez ou importez un plan existant : l'IA détecte les tables, les numéros, les assises et le
              mobilier, puis les place sur le canevas.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void handleImportImageChange(event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void handleImportImageChange(event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 bg-background text-xs"
            disabled={loading || disabled || preparingImage}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" />
            Prendre en photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 bg-background text-xs"
            disabled={loading || disabled || preparingImage}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="h-3.5 w-3.5" />
            Importer
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          ou glissez une image ici · JPG, PNG ou WebP
        </p>

        {preparingImage ? (
          <p className="text-center text-[10px] font-medium text-muted-foreground">Préparation de l'image…</p>
        ) : null}

        {importImage ? (
          <div className="space-y-1.5">
            <div className="overflow-hidden rounded-lg border bg-white dark:bg-slate-900">
              <img src={importImage.dataUrl} alt="Aperçu du plan importé" className="h-24 w-full object-contain" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                {importImage.name} · {importImage.width}×{importImage.height}
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive hover:underline"
                onClick={() => setImportImage(null)}
              >
                <Trash2 className="h-3 w-3" />
                Retirer
              </button>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          size="sm"
          className="w-full gap-2 text-xs font-bold"
          disabled={loading || disabled || preparingImage || !importImage}
          onClick={() => callAI("image-import", undefined, importImage)}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Placer automatiquement le mobilier
        </Button>
      </div>

      <div className="space-y-1.5">
        {SUGGESTED_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => callAI(action.id)}
            disabled={loading || disabled}
            className={`flex w-full items-center gap-3 rounded-xl p-2.5 transition-all ${action.bg} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <action.icon className={`h-4 w-4 shrink-0 ${action.color}`} />
            <div className="min-w-0 text-left">
              <p className="text-xs font-bold leading-tight">{action.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{action.description}</p>
            </div>
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
        <Input
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Demande personnalisée..."
          className="h-8 text-xs"
          disabled={loading || disabled}
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          disabled={loading || disabled || !customPrompt.trim()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>

      {loading && (
        <AiLoadingState
          compact
          title="Analyse du plan en cours"
          description="L'IA vérifie la salle, la capacité et les placements avant de proposer une disposition."
          steps={["Salle", "Tables", "Flux"]}
        />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-bold">Suggestion IA</p>
          </div>

          <ScrollArea className="max-h-32">
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
              {result.explanation}
            </p>
          </ScrollArea>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">
              <span className="font-bold text-foreground">{result.tables.length}</span> elements ·{" "}
              <span className="font-bold text-foreground">
                {result.tables.reduce((s, t) => s + (t.capacity || 0), 0)}
              </span>{" "}
              couverts
            </div>
          </div>

          <Button
            size="sm"
            className="w-full gap-2 text-xs font-bold"
            onClick={() => onApply(result)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Appliquer cette disposition
          </Button>
        </div>
      )}
    </div>
  );
}
