import { createRoot } from "react-dom/client";
import { useState } from "react";
import TokAiVideoStudio from "@/components/dashboard/TokAiVideoStudio";
import { validatePreparedRestaurantReel } from "@/lib/media/validateRestaurantReel";
import { drawReelFrame } from "@/lib/media/restaurantReelRenderer";
import { DEFAULT_REEL_SETTINGS } from "@/lib/media/restaurantReelPlan";
import "@/index.css";

declare global {
  interface Window {
    __reelExport?: File;
    __validateReel?: (file?: File) => Promise<boolean>;
    __verifyDissolve?: () => Promise<number[]>;
  }
}
window.__validateReel = async (file = window.__reelExport) => Boolean(file && await validatePreparedRestaurantReel(file) === file);
window.__verifyDissolve = async () => {
  const source = document.createElement("canvas"); source.width = 36; source.height = 64;
  const context = source.getContext("2d")!; context.fillStyle = "#ff0000"; context.fillRect(0, 0, 36, 64);
  const photo = await createImageBitmap(source);
  try {
    drawReelFrame(context, { photos: [photo, photo], logo: null, close: () => {} }, DEFAULT_REEL_SETTINGS, 4.825);
    return [...context.getImageData(18, 32, 1, 1).data];
  } finally { photo.close(); }
};

export default function Fixture() {
  const [attached, setAttached] = useState(false);
  return <main className="mx-auto max-w-6xl p-3 sm:p-6">
    <TokAiVideoStudio restaurantId="fixture-restaurant" mode="reel" onUseVideo={(file) => { window.__reelExport = file; setAttached(true); }} />
    {attached ? <p role="status">Reel ajouté au brouillon de test</p> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
