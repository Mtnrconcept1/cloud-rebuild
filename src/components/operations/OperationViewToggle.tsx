import { Grid2X2, LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type OperationViewMode = "gallery" | "list" | "details";

type OperationViewToggleProps = {
  value: OperationViewMode;
  onChange: (value: OperationViewMode) => void;
  ariaLabel: string;
};

export default function OperationViewToggle({ value, onChange, ariaLabel }: OperationViewToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onChange(nextValue as OperationViewMode);
      }}
      className="justify-start rounded-xl border bg-muted/20 p-1"
      aria-label={ariaLabel}
    >
      <ToggleGroupItem value="gallery" aria-label="Afficher en galerie" className="h-9 gap-2 rounded-lg px-3">
        <Grid2X2 className="h-4 w-4" />
        <span className="hidden sm:inline">Galerie</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="Afficher en liste" className="h-9 gap-2 rounded-lg px-3">
        <List className="h-4 w-4" />
        <span className="hidden sm:inline">Liste</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="details" aria-label="Afficher les détails" className="h-9 gap-2 rounded-lg px-3">
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Détails</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
