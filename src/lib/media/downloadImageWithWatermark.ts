type DownloadImageOptions = {
  imageUrl: string;
  fileName: string;
  watermarkUrl?: string | null;
  watermarkSize?: number;
  watermarkMargin?: number;
};

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function fetchBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("download_failed");
  return response.blob();
}

async function loadImage(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image_load_failed"));
      image.src = objectUrl;
    });

    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas_export_failed"));
    }, "image/png");
  });
}

async function composeWatermarkedPng(options: DownloadImageOptions) {
  if (!options.watermarkUrl) return fetchBlob(options.imageUrl);

  const [sourceBlob, watermarkBlob] = await Promise.all([
    fetchBlob(options.imageUrl),
    fetchBlob(options.watermarkUrl),
  ]);
  const source = await loadImage(sourceBlob);
  const watermark = await loadImage(watermarkBlob);

  try {
    const width = source.image.naturalWidth || source.image.width;
    const height = source.image.naturalHeight || source.image.height;
    if (!width || !height) throw new Error("invalid_image_dimensions");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_context_unavailable");

    context.drawImage(source.image, 0, 0, width, height);

    const baseSize = options.watermarkSize ?? 180;
    const size = Math.min(baseSize, Math.max(56, Math.round(Math.min(width, height) * 0.26)));
    const margin = Math.min(options.watermarkMargin ?? 24, Math.max(12, Math.round(Math.min(width, height) * 0.04)));
    const watermarkWidth = watermark.image.naturalWidth || watermark.image.width;
    const watermarkHeight = watermark.image.naturalHeight || watermark.image.height;
    if (!watermarkWidth || !watermarkHeight) throw new Error("invalid_watermark_dimensions");

    const watermarkRatio = watermarkWidth / watermarkHeight;
    const drawWidth = watermarkRatio >= 1 ? size : Math.round(size * watermarkRatio);
    const drawHeight = watermarkRatio >= 1 ? Math.round(size / watermarkRatio) : size;
    context.drawImage(watermark.image, margin, margin, drawWidth, drawHeight);

    return await canvasToPngBlob(canvas);
  } finally {
    URL.revokeObjectURL(source.objectUrl);
    URL.revokeObjectURL(watermark.objectUrl);
  }
}

export async function downloadImageWithWatermark(options: DownloadImageOptions) {
  if (!options.watermarkUrl) {
    const blob = await fetchBlob(options.imageUrl);
    downloadBlob(blob, options.fileName);
    return;
  }

  const blob = await composeWatermarkedPng(options);
  downloadBlob(blob, options.fileName);
}
