import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/listSorting";

export type SortControlsOption<K extends string = string> = {
  key: K;
  label: string;
};

type SortControlsProps<K extends string = string> = {
  columns: readonly SortControlsOption<K>[];
  sortKey: K;
  direction: SortDirection;
  onSortKeyChange: (key: K) => void;
  onDirectionChange: (direction: SortDirection) => void;
  className?: string;
  columnLabel?: string;
  directionLabel?: string;
};

export default function SortControls<K extends string = string>({
  columns,
  sortKey,
  direction,
  onSortKeyChange,
  onDirectionChange,
  className,
  columnLabel = "Trier par",
  directionLabel = "Ordre",
}: SortControlsProps<K>) {
  const DirectionIcon = direction === "asc" ? ArrowUpAZ : ArrowDownAZ;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]", className)}>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{columnLabel}</p>
        <Select value={sortKey} onValueChange={(value) => onSortKeyChange(value as K)}>
          <SelectTrigger>
            <SelectValue placeholder="Colonne" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.key} value={column.key}>
                {column.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{directionLabel}</p>
        <Select value={direction} onValueChange={(value) => onDirectionChange(value as SortDirection)}>
          <SelectTrigger>
            <span className="flex min-w-0 items-center gap-2">
              <DirectionIcon className="h-4 w-4 shrink-0" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Croissant</SelectItem>
            <SelectItem value="desc">Décroissant</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
