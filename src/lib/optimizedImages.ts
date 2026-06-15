export type OptimizedImagePreset = "thumbnail" | "card" | "hero" | "gallery";

type OptimizedImageOptions = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
};

const PRESET_OPTIONS: Record<OptimizedImagePreset, OptimizedImageOptions> = {
  thumbnail: { width: 180, height: 180, quality: 72, resize: "cover" },
  card: { width: 720, height: 450, quality: 76, resize: "cover" },
  hero: { width: 1440, height: 720, quality: 78, resize: "cover" },
  gallery: { width: 960, height: 960, quality: 78, resize: "contain" },
};

const SRC_SET_WIDTHS: Record<OptimizedImagePreset, number[]> = {
  thumbnail: [96, 180, 320],
  card: [360, 540, 720, 960],
  hero: [720, 1080, 1440, 1920],
  gallery: [480, 720, 960, 1280],
};

function isSupabasePublicStorageUrl(url: URL) {
  return url.pathname.includes("/storage/v1/object/public/");
}

function buildTransformedSupabaseUrl(rawUrl: string, options: OptimizedImageOptions) {
  try {
    const url = new URL(rawUrl);
    if (!isSupabasePublicStorageUrl(url)) return rawUrl;

    url.pathname = url.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");

    if (options.width) url.searchParams.set("width", String(options.width));
    if (options.height) url.searchParams.set("height", String(options.height));
    if (options.quality) url.searchParams.set("quality", String(options.quality));
    if (options.resize) url.searchParams.set("resize", options.resize);
    url.searchParams.set("format", "webp");

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function getOptimizedImageUrl(
  rawUrl: string | null | undefined,
  preset: OptimizedImagePreset,
  overrides: OptimizedImageOptions = {},
) {
  if (!rawUrl) return "";
  return buildTransformedSupabaseUrl(rawUrl, { ...PRESET_OPTIONS[preset], ...overrides });
}

export function getOptimizedImageSrcSet(rawUrl: string | null | undefined, preset: OptimizedImagePreset) {
  if (!rawUrl) return undefined;

  const entries = SRC_SET_WIDTHS[preset]
    .map((width) => {
      const transformedUrl = getOptimizedImageUrl(rawUrl, preset, { width, height: undefined });
      return transformedUrl === rawUrl ? null : `${transformedUrl} ${width}w`;
    })
    .filter(Boolean);

  return entries.length > 0 ? entries.join(", ") : undefined;
}

export function getOptimizedImageSizes(preset: OptimizedImagePreset) {
  if (preset === "thumbnail") return "96px";
  if (preset === "card") return "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";
  if (preset === "hero") return "100vw";
  return "(min-width: 768px) 33vw, 50vw";
}

export const IMAGE_UPLOAD_MAX_DIMENSION = 1920;
export const IMAGE_UPLOAD_WEBP_QUALITY = 0.82;

function canOptimizeUpload(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    image.src = url;
  });
}

function getTargetDimensions(width: number, height: number) {
  const maxDimension = Math.max(width, height);
  if (maxDimension <= IMAGE_UPLOAD_MAX_DIMENSION) return { width, height };

  const ratio = IMAGE_UPLOAD_MAX_DIMENSION / maxDimension;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Compression image impossible."));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

export async function optimizeImageUpload(file: File): Promise<File> {
  if (!canOptimizeUpload(file)) return file;

  const image = await loadImageFromFile(file);
  const dimensions = getTargetDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return file;

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  const blob = await canvasToBlob(canvas, "image/webp", IMAGE_UPLOAD_WEBP_QUALITY);
  if (blob.size >= file.size && file.type === "image/webp") return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
}
