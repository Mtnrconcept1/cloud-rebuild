import type { FloorPlanTableLayout } from "@/lib/floorPlan";

export type StudioLibraryTab = "tables" | "seating" | "structure" | "decor";

export type StudioDraftTable = {
  id: string;
  table_number: string;
  capacity: number;
  is_active: boolean;
  sector: string;
  layout: FloorPlanTableLayout;
};

export type StudioRenderedTableFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};
