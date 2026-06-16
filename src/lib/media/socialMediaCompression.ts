import { optimizeImageUpload } from "@/lib/optimizedImages";

export const SOCIAL_VIDEO_TARGET_MAX_DIMENSION = 1280;
export const SOCIAL_VIDEO_TARGET_FPS = 24;
export const SOCIAL_VIDEO_MIN_BITS_PER_SECOND = 850_000;
export const SOCIAL_VIDEO_MAX_BITS_PER_SECOND = 2_800_000;
export const SOCIAL_VIDEO_AUDIO_BITS_PER_SECOND = 96_000;
export const SOCIAL_VIDEO_COMPRESSION_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export function isVerticalSocialVideoDimensions(width: number, height: number) {
  return Number.isFinite(width) && Number.isFinite(height) && height > width * 1.35;
}

function isBrowserVideoCompressionAvailable() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof URL !== "undefined"
  );
}

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function getSocialVideoTargetDimensions(width: number, height: number) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : SOCIAL_VIDEO_TARGET_MAX_DIMENSION;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : Math.round(SOCIAL_VIDEO_TARGET_MAX_DIMENSION * 9 / 16);
  const maxDimension = Math.max(safeWidth, safeHeight);

  if (maxDimension <= SOCIAL_VIDEO_TARGET_MAX_DIMENSION) {
    return { width: even(safeWidth), height: even(safeHeight) };
  }

  const ratio = SOCIAL_VIDEO_TARGET_MAX_DIMENSION / maxDimension;
  return {
    width: even(safeWidth * ratio),
    height: even(safeHeight * ratio),
  };
}

export function getSocialVideoBitsPerSecond(width: number, height: number) {
  const pixels = Math.max(1, width * height);
  const estimated = Math.round(pixels * SOCIAL_VIDEO_TARGET_FPS * 0.095);
  return Math.min(SOCIAL_VIDEO_MAX_BITS_PER_SECOND, Math.max(SOCIAL_VIDEO_MIN_BITS_PER_SECOND, estimated));
}

export function getSupportedSocialVideoMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return SOCIAL_VIDEO_COMPRESSION_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Vidéo illisible."));
    };
    video.src = url;
  });
}

async function playVideoForRecording(video: HTMLVideoElement) {
  video.currentTime = 0;

  try {
    video.muted = false;
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
}

function waitForRecorderStop(recorder: MediaRecorder) {
  return new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Compression vidéo interrompue."));
  });
}

async function compressVideoUpload(file: File): Promise<File> {
  if (!isBrowserVideoCompressionAvailable()) return file;

  const mimeType = getSupportedSocialVideoMimeType();
  if (!mimeType) return file;

  let url: string | null = null;
  let recorder: MediaRecorder | null = null;
  let frameRequest = 0;

  try {
    const loaded = await loadVideo(file);
    const { video } = loaded;
    url = loaded.url;
    const dimensions = getSocialVideoTargetDimensions(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d", { alpha: false });
    const stream = canvas.captureStream?.(SOCIAL_VIDEO_TARGET_FPS);
    if (!context || !stream) return file;

    const sourceStream = typeof video.captureStream === "function" ? video.captureStream() : null;
    sourceStream?.getAudioTracks().forEach((track) => stream.addTrack(track));

    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: getSocialVideoBitsPerSecond(dimensions.width, dimensions.height),
      audioBitsPerSecond: SOCIAL_VIDEO_AUDIO_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const drawFrame = () => {
      context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
      if (!video.ended && !video.paused) {
        frameRequest = window.requestAnimationFrame(drawFrame);
      }
    };

    const stopped = waitForRecorderStop(recorder);
    recorder.start(1000);
    await playVideoForRecording(video);
    drawFrame();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });
    recorder.stop();
    await stopped;

    stream.getTracks().forEach((track) => track.stop());
    sourceStream?.getTracks().forEach((track) => track.stop());

    const outputType = mimeType.split(";")[0] || "video/webm";
    const blob = new Blob(chunks, { type: outputType });
    if (!blob.size || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([blob], `${baseName}.webm`, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Social video compression skipped", error);
    return file;
  } finally {
    if (frameRequest) window.cancelAnimationFrame(frameRequest);
    if (recorder?.state === "recording") recorder.stop();
    if (url) URL.revokeObjectURL(url);
  }
}

export async function optimizeSocialMediaUpload(file: File): Promise<File> {
  if (file.type.startsWith("image/")) return optimizeImageUpload(file);
  if (file.type.startsWith("video/")) return compressVideoUpload(file);
  return file;
}
