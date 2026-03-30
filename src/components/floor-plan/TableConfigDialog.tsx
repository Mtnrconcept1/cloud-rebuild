import { useEffect, useState } from "react";
import { Armchair } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SEAT_TYPE_LABELS,
  type FloorPlanSeatType,
  type FloorPlanTablePreset,
  type FloorPlanTableShape,
} from "@/lib/floorPlan";

import { FloorPlanItemIllustration } from "./FloorPlanItemIllustration";

type TableConfig = {
  capacity: number;
  shape: FloorPlanTableShape;
  seatType: FloorPlanSeatType;
};

type TableConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig: TableConfig | null;
  preset: FloorPlanTablePreset | null;
  onConfirm: (config: TableConfig) => void;
};

function SeatTypeIcon({ type }: { type: FloorPlanSeatType }) {
  const s = "#7a5a3a";
  const f = "#faf3e8";
  const d = "#d4956a";
  switch (type) {
    case "chair":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="M6,16 A6,6 0 0,1 18,16 Z" fill={f} stroke={s} strokeWidth="1.5" />
        </svg>
      );
    case "stool":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <circle cx="12" cy="12" r="6" fill={f} stroke={s} strokeWidth="1.5" />
        </svg>
      );
    case "bench":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <rect x="3" y="8" width="18" height="8" rx="2" fill={d} stroke={s} strokeWidth="1.5" />
        </svg>
      );
    case "corner-bench":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="M4,4 L16,4 L16,10 L10,10 L10,20 L4,20 Z" fill={d} stroke={s} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
  }
}

const SEAT_TYPE_OPTIONS: FloorPlanSeatType[] = ["chair", "stool", "bench", "corner-bench"];

export default function TableConfigDialog({
  open,
  onOpenChange,
  initialConfig,
  preset,
  onConfirm,
}: TableConfigDialogProps) {
  const isEditing = !!initialConfig;
  const defaults = initialConfig || {
    capacity: preset?.capacity || 4,
    shape: preset?.shape || "rect",
    seatType: "chair" as FloorPlanSeatType,
  };

  const [capacity, setCapacity] = useState(defaults.capacity);
  const [shape, setShape] = useState<FloorPlanTableShape>(defaults.shape);
  const [seatType, setSeatType] = useState<FloorPlanSeatType>(defaults.seatType);

  useEffect(() => {
    if (open) {
      setCapacity(defaults.capacity);
      setShape(defaults.shape);
      setSeatType(defaults.seatType);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Armchair className="h-5 w-5" />
            {isEditing ? "Modifier la table" : "Configurer la table"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Ajustez la capacite, la forme et le type d'assise."
              : "Choisissez combien de personnes peuvent s'installer et quel mobilier les entoure."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="mx-auto flex h-44 w-64 items-center justify-center rounded-2xl border bg-slate-50/80">
            <FloorPlanItemIllustration
              kind="table"
              shape={shape}
              capacity={capacity}
              seatType={seatType}
              decorative={false}
              className="h-40 w-56"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Nombre de places</Label>
              <span className="text-sm font-bold text-primary">{capacity}</span>
            </div>
            <Slider
              min={1}
              max={16}
              step={1}
              value={[capacity]}
              onValueChange={(v) => setCapacity(v[0] || 1)}
            />
          </div>

          <div className="space-y-2">
            <Label>Forme de la table</Label>
            <ToggleGroup
              type="single"
              value={shape}
              onValueChange={(v) => { if (v) setShape(v as FloorPlanTableShape); }}
              className="justify-start"
            >
              <ToggleGroupItem value="rect" className="px-4">
                Rectangle
              </ToggleGroupItem>
              <ToggleGroupItem value="round" className="px-4">
                Ronde
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>Type d'assise</Label>
            <ToggleGroup
              type="single"
              value={seatType}
              onValueChange={(v) => { if (v) setSeatType(v as FloorPlanSeatType); }}
              className="justify-start"
            >
              {SEAT_TYPE_OPTIONS.map((type) => (
                <ToggleGroupItem key={type} value={type} className="gap-1.5 px-3">
                  <SeatTypeIcon type={type} />
                  <span className="text-xs">{SEAT_TYPE_LABELS[type]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm({ capacity, shape, seatType })}>
            {isEditing ? "Appliquer" : "Ajouter la table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
