import { useId } from "react";
import { FloorPlanItemIllustration } from "./FloorPlanItemIllustration";
import type { StudioDraftTable } from "./studioShared";
import {
  buildFloorPlanViewportModel,
  isReservableFloorPlanItem,
} from "@/lib/floorPlan";
import { cn } from "@/lib/utils";

function getPreviewLayer(table: StudioDraftTable) {
  if (table.layout.visualVariant === "parasol") return 0;
  if (table.layout.visualVariant === "table-plant") return 2;
  return 1;
}

export default function FloorPlanMiniature({
  tables,
  label = "Aperçu du plan",
  className,
}: {
  tables: StudioDraftTable[];
  label?: string;
  className?: string;
}) {
  const patternId = `oak-${useId().replace(/:/g, "")}`;
  const model = buildFloorPlanViewportModel(tables, {
    sector: tables[0]?.sector || "",
    zoom: 1,
    canvasWidth: 1040,
    canvasHeight: 760,
  });
  const renderedItems = [...model.visibleItems].sort(
    (left, right) => getPreviewLayer(left) - getPreviewLayer(right),
  );
  return (
    <div className={cn("fp-miniature", className)}>
      <svg viewBox="0 0 1040 760" role="img" aria-label={label}>
        <defs>
          <pattern
            id={patternId}
            width="60"
            height="180"
            patternUnits="userSpaceOnUse"
          >
            <rect width="60" height="180" fill="#e9d9bf" />
            <path
              d="M0 0H60V180H0Z"
              fill="none"
              stroke="#c7af8b"
              strokeOpacity=".24"
            />
            <path d="M3 0V180M12 0V180" stroke="#fff" strokeOpacity=".1" />
          </pattern>
        </defs>
        <rect
          x="24"
          y="24"
          width="992"
          height="712"
          rx="12"
          fill="#eee9df"
          stroke="#d1c9bb"
          strokeWidth="14"
        />
        <rect
          x="46"
          y="46"
          width="948"
          height="668"
          rx="3"
          fill={`url(#${patternId})`}
        />
        {renderedItems.map((table) => {
          const frame = model.getRenderedFrame(table);
          return (
            <g key={table.id}>
              <g
                transform={`translate(${frame.x} ${frame.y}) rotate(${table.layout.rotation} ${frame.w / 2} ${frame.h / 2})`}
              >
                <svg width={frame.w} height={frame.h} overflow="visible">
                  <FloorPlanItemIllustration
                    kind={table.layout.kind}
                    shape={table.layout.shape}
                    visualVariant={table.layout.visualVariant}
                    finish={table.layout.finish}
                    capacity={table.capacity}
                    seatType={table.layout.seatType}
                    seatPlacements={table.layout.seatPlacements}
                    cornerBenchCorners={table.layout.cornerBenchCorners}
                    cornerBenchConfigs={table.layout.cornerBenchConfigs}
                    tableWidth={table.layout.tableWidth}
                    tableHeight={table.layout.tableHeight}
                    cornerBenchHorizontal={table.layout.cornerBenchHorizontal}
                    cornerBenchVertical={table.layout.cornerBenchVertical}
                    cornerBenchDepth={table.layout.cornerBenchDepth}
                    className="h-full w-full"
                    preserveAspectRatio="none"
                  />
                </svg>
              </g>
              {isReservableFloorPlanItem(table.layout.kind) ? (
                <text
                  x={frame.x + frame.w / 2}
                  y={frame.y + frame.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#47392d"
                  fontFamily="sans-serif"
                  fontSize="15"
                  fontWeight="600"
                >
                  {table.table_number}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
