import { useState } from "react";
import { Bot, Loader2, LayoutGrid, Lightbulb, Sofa, Wand2, Send, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

export type AIFloorPlanTable = {
  table_number: string;
  capacity: number;
  kind: string;
  shape: "round" | "rect";
  seatType?: string;
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
    label: "Generer un plan",
    description: "Cree un plan optimise de A a Z",
    icon: LayoutGrid,
    color: "text-blue-500",
    bg: "bg-blue-500/10 hover:bg-blue-500/20",
  },
  {
    id: "optimize",
    label: "Optimiser le placement",
    description: "Ameliore la disposition actuelle",
    icon: Wand2,
    color: "text-amber-500",
    bg: "bg-amber-500/10 hover:bg-amber-500/20",
  },
  {
    id: "suggest-furniture",
    label: "Suggerer du mobilier",
    description: "Plantes, bar, separateurs...",
    icon: Sofa,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
  },
] as const;

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

  const callAI = async (action: string, prompt?: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Non connecte");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/floorplan-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            restaurantId,
            currentLayout,
            canvasWidth,
            canvasHeight,
            prompt,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Erreur inconnue" }));
        throw new Error(body.error || `Erreur ${response.status}`);
      }

      const data: AIFloorPlanResult = await response.json();
      if (!data.tables || !Array.isArray(data.tables)) {
        throw new Error("Reponse IA invalide");
      }
      setResult(data);
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

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">Assistant IA</h3>
          <p className="text-[10px] text-muted-foreground">Powered by OpenAI</p>
        </div>
      </div>

      {/* Quick actions */}
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

      {/* Custom prompt */}
      <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
        <Input
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Demande personnalisee..."
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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 rounded-xl bg-primary/5 p-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs font-medium text-primary">L'IA analyse votre plan...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/5 border border-destructive/20 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-bold">Suggestion IA</p>
          </div>

          <ScrollArea className="max-h-32">
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
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
