import { registerPreparedSocialVideo } from "@/lib/media/socialMediaCompression";
import { boundedReelImageSize, readReelImageDimensions } from "./reelImageGeometry";
import {
  RESTAURANT_REEL_FPS, RESTAURANT_REEL_HEIGHT, RESTAURANT_REEL_SECONDS,
  RESTAURANT_REEL_WIDTH, RESTAURANT_REEL_MAX_PHOTOS, normalizeReelSettings,
  reelFrameAt, type ReelSettings,
} from "./restaurantReelPlan";

export type ReelImage = { id: string; url: string };
export type ReelAssets = { photos: ImageBitmap[]; logo: ImageBitmap | null; close: () => void };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const transitionLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

async function loadImage(source: ReelImage, signal?: AbortSignal) {
  const url = new URL(source.url, window.location.origin);
  if (url.protocol !== "https:" && url.origin !== window.location.origin) {
    throw new Error("Cette image ne peut pas être chargée. Importez-la dans votre galerie.");
  }
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, { mode: "cors", credentials: "omit", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error("Une image sélectionnée est indisponible. Retirez-la ou importez-la à nouveau.");
  const size = Number(response.headers.get("content-length"));
  if (size > MAX_IMAGE_BYTES) throw new Error("Une image dépasse 10 Mo.");
  const blob = await response.blob();
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || !blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Les références doivent être des images JPEG, PNG ou WebP de 10 Mo maximum.");
  }
  signal?.throwIfAborted();
  readReelImageDimensions(await blob.arrayBuffer());
  signal?.throwIfAborted();
  const original = await createImageBitmap(blob);
  let image = original;
  try {
    // Use decoded dimensions to respect JPEG orientation; never enlarge a small logo.
    const size = boundedReelImageSize(original.width, original.height);
    if (size.width !== original.width || size.height !== original.height) {
      image = await createImageBitmap(original, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "high" });
    }
  } catch (error) { original.close(); throw error; }
  if (image !== original) original.close();
  if (signal?.aborted) { image.close(); signal.throwIfAborted(); }
  return image;
}

export async function loadReelAssets(photos: ReelImage[], logo: ReelImage | null, signal?: AbortSignal): Promise<ReelAssets> {
  if (photos.length > RESTAURANT_REEL_MAX_PHOTOS || (!photos.length && !logo)) {
    throw new Error("Sélectionnez au moins une photo ou votre logo.");
  }
  const loaded: ImageBitmap[] = [];
  try {
    // Sequential loading bounds peak image decoding memory and cleans up on any failure.
    for (const photo of photos) loaded.push(await loadImage(photo, signal));
    const logoImage = logo ? await loadImage(logo, signal) : null;
    return { photos: loaded, logo: logoImage, close: () => { loaded.forEach((item) => item.close()); logoImage?.close(); } };
  } catch (error) { loaded.forEach((item) => item.close()); throw error; }
}

function drawPhoto(ctx: CanvasRenderingContext2D, image: ImageBitmap, settings: ReelSettings, progress: number) {
  const { width, height } = ctx.canvas;
  const hasMotion = settings.motion !== "none";
  let scale = settings.photoFit === "cover"
    ? Math.max(width / image.width, height / image.height)
    : Math.min(width / image.width, height / image.height) * (hasMotion ? 0.94 : 1);
  const smooth = progress * progress * (3 - 2 * progress);
  if (settings.motion === "zoom-in") scale *= 1 + 0.05 * smooth;
  if (settings.motion === "zoom-out") scale *= 1.05 - 0.05 * smooth;
  if (settings.photoFit === "cover" && settings.motion.startsWith("pan-")) scale *= 1.05;
  const w = image.width * scale;
  const h = image.height * scale;
  const pan = settings.motion === "pan-left" ? 1 - 2 * smooth : settings.motion === "pan-right" ? 2 * smooth - 1 : 0;
  const margin = Math.abs(width - w) / 2;
  ctx.drawImage(image, (width - w) / 2 + pan * Math.min(width * 0.025, margin), (height - h) / 2, w, h);
}

function drawLogo(ctx: CanvasRenderingContext2D, image: ImageBitmap, settings: ReelSettings, onlyLogo: boolean, captionTop: number) {
  const { width, height } = ctx.canvas;
  const boxWidth = width * (onlyLogo ? 0.65 : 0.3);
  const boxHeight = height * (onlyLogo ? 0.5 : 0.12);
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (width - w) / 2;
  const safeBottom = Math.min(height * 0.83, captionTop - width * 0.06);
  const y = onlyLogo ? Math.min((height - h) / 2, safeBottom - h) : settings.logoPosition === "top" ? height * 0.07 : safeBottom - h;
  if (settings.logoPlate && !onlyLogo) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - width * 0.018, y - width * 0.018, w + width * 0.036, h + width * 0.036);
  }
  // The original logo occupies its own zone, independently of motion and transitions.
  ctx.drawImage(image, x, y, w, h);
}

export function drawReelFrame(ctx: CanvasRenderingContext2D, assets: ReelAssets, input: ReelSettings, seconds: number) {
  const settings = normalizeReelSettings(input);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (assets.photos.length) {
    const frame = reelFrameAt(seconds, assets.photos.length, settings.transition);
    drawPhoto(ctx, assets.photos[frame.index], settings, frame.progress);
    if (frame.blend > 0) {
      let layer = transitionLayers.get(ctx.canvas);
      if (!layer) { layer = document.createElement("canvas"); transitionLayers.set(ctx.canvas, layer); }
      if (layer.width !== ctx.canvas.width || layer.height !== ctx.canvas.height) {
        layer.width = ctx.canvas.width; layer.height = ctx.canvas.height;
      }
      const next = layer.getContext("2d", { alpha: false });
      if (!next) throw new Error("Le rendu des transitions est indisponible.");
      next.fillStyle = settings.background;
      next.fillRect(0, 0, layer.width, layer.height);
      drawPhoto(next, assets.photos[frame.nextIndex], settings, 0);
      // Composite the next opaque scene once. Applying alpha to its background AND photo washes out colors.
      ctx.globalAlpha = frame.blend;
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  let caption: { shown: string[]; lineHeight: number; bottom: number; top: number } | null = null;
  if (settings.caption.trim()) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.font = `600 ${Math.round(w * 0.045)}px ${settings.font === "serif" ? "Georgia, serif" : "Arial, sans-serif"}`;
    ctx.textAlign = "center";
    const words = settings.caption.trim().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > w * 0.84 && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 4);
    const lineHeight = w * 0.06;
    const bottom = h * 0.93;
    caption = { shown, lineHeight, bottom, top: bottom - lineHeight * shown.length - w * 0.03 };
  }
  if (assets.logo) drawLogo(ctx, assets.logo, settings, !assets.photos.length, caption?.top ?? ctx.canvas.height);
  if (caption) {
    const w = ctx.canvas.width;
    const { shown, lineHeight, bottom, top } = caption;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(w * 0.045, top, w * 0.91, lineHeight * shown.length + w * 0.06);
    ctx.fillStyle = "#ffffff";
    shown.forEach((text, i) => ctx.fillText(text, w / 2, bottom - (shown.length - 1 - i) * lineHeight, w * 0.84));
  }
  ctx.restore();
}

export async function renderRestaurantReel(input: {
  assets: ReelAssets;
  settings: ReelSettings;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}): Promise<File> {
  const { assets, signal } = input;
  if (!assets.photos.length && !assets.logo) throw new Error("Sélectionnez une photo ou un logo.");
  signal?.throwIfAborted();
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } = await import("mediabunny");
  const quality = new Quality({ bitrate: 4_000_000 });
  const supported = await canEncodeVideo("avc", {
    width: RESTAURANT_REEL_WIDTH, height: RESTAURANT_REEL_HEIGHT, frameRate: RESTAURANT_REEL_FPS, quality,
  });
  if (!supported) throw new Error("Ce navigateur ne permet pas l'export MP4. Votre brouillon est conservé : ouvrez-le dans un navigateur récent compatible WebCodecs.");
  const canvas = document.createElement("canvas");
  canvas.width = RESTAURANT_REEL_WIDTH;
  canvas.height = RESTAURANT_REEL_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Le rendu vidéo est indisponible dans ce navigateur.");
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(canvas, { codec: "avc", quality });
  output.addVideoTrack(source, { frameRate: RESTAURANT_REEL_FPS });
  try {
    await output.start();
    const count = RESTAURANT_REEL_SECONDS * RESTAURANT_REEL_FPS;
    for (let frame = 0; frame < count; frame++) {
      signal?.throwIfAborted();
      drawReelFrame(ctx, assets, input.settings, frame / RESTAURANT_REEL_FPS);
      // Explicit timestamps, not wall-clock recording: exactly 300 frames / 10 seconds.
      await source.add(frame / RESTAURANT_REEL_FPS, 1 / RESTAURANT_REEL_FPS);
      input.onProgress?.((frame + 1) / count);
      if (frame % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    signal?.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error("L'export vidéo est vide. Relancez le rendu depuis votre brouillon.");
    return registerPreparedSocialVideo(new File([target.buffer], "reel-restaurant-10s.mp4", { type: "video/mp4" }));
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw error;
  }
}
