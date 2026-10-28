import type { FloorPlanTableFinish } from "@/lib/floorPlan";
import {
  FLOOR_PLAN_ASSETS,
  getFloorPlanAssetRect,
  getFloorPlanTableFinishFilter,
  type FloorPlanAssetId,
  type FloorPlanAssetRect,
  type FloorPlanAssetFit,
} from "./floorPlanAssets";

type FloorPlanAssetSpriteProps = FloorPlanAssetRect & {
  assetId: FloorPlanAssetId;
  rotation?: number;
  fit?: FloorPlanAssetFit;
  opacity?: number;
  finish?: FloorPlanTableFinish;
};

export function FloorPlanAssetSprite({
  assetId,
  x,
  y,
  width,
  height,
  rotation,
  fit = "contain",
  opacity,
  finish,
}: FloorPlanAssetSpriteProps) {
  const asset = FLOOR_PLAN_ASSETS[assetId];
  const rect = getFloorPlanAssetRect(asset, { x, y, width, height }, fit);

  return (
    <image
      data-floor-plan-asset={assetId}
      href={asset.src}
      {...rect}
      opacity={opacity}
      preserveAspectRatio="none"
      transform={
        rotation == null
          ? undefined
          : `rotate(${rotation} ${x + width / 2} ${y + height / 2})`
      }
      style={{
        pointerEvents: "none",
        filter: getFloorPlanTableFinishFilter(assetId, finish),
      }}
    />
  );
}
