import { assertSafeFileUpload, MAX_SOCIAL_MEDIA_UPLOAD_BYTES } from "@/lib/uploadSecurity";
import { registerPreparedSocialVideo } from "./socialMediaCompression";

const FRAME_TOLERANCE = 1 / 24 + 0.002;
const validDimensions = (width: number, height: number) => Number.isFinite(width * height)
  && width >= 1 && height >= 1 && width * height <= 1080 * 1920 && Math.abs(width * 16 - height * 9) <= 16;

/** Validate actual bytes, including the full decoded timeline, before skipping social re-encoding. */
export async function validatePreparedRestaurantReel(file: File, signal?: AbortSignal): Promise<File> {
  assertSafeFileUpload(file, { allowedMimeTypes: { "video/mp4": "mp4" }, maxBytes: MAX_SOCIAL_MEDIA_UPLOAD_BYTES, label: "Reel" });
  const timeout = AbortSignal.timeout(30_000);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  abort.throwIfAborted();
  const { Input, BlobSource, MP4, VideoSampleSink } = await import("mediabunny");
  abort.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: [MP4] });
  const cancel = () => input.dispose();
  abort.addEventListener("abort", cancel, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("Ce fichier ne contient pas de vidéo lisible.");
    const [width, height, videoEnd, containerEnd, first] = await Promise.all([
      track.getDisplayWidth(), track.getDisplayHeight(), track.computeDuration(), input.computeDuration(), track.getFirstTimestamp(),
    ]);
    abort.throwIfAborted();
    if (![videoEnd, containerEnd, first].every(Number.isFinite)
      || Math.abs(videoEnd - 10) > FRAME_TOLERANCE || Math.abs(containerEnd - 10) > FRAME_TOLERANCE || Math.abs(first) > FRAME_TOLERANCE) {
      throw new Error("Le fichier reçu ne dure pas 10 secondes. Utilisez le mode Reel fidèle pour un export exact.");
    }
    if (!validDimensions(width, height)) {
      throw new Error("Le fichier reçu ne respecte pas le format vertical 9:16 du reel.");
    }
    if (!await track.canDecode()) throw new Error("Ce navigateur ne peut pas vérifier cette vidéo. Ouvrez votre historique dans un navigateur récent.");
    const sink = new VideoSampleSink(track);
    let count = 0;
    let end = first;
    for await (const sample of sink.samples()) {
      try {
        abort.throwIfAborted();
        if (!validDimensions(sample.displayWidth, sample.displayHeight)) throw new Error("La vidéo reçue ne respecte pas le format vertical 9:16.");
        if (++count > 600 || !Number.isFinite(sample.timestamp + sample.duration)
          || sample.timestamp - end > FRAME_TOLERANCE) throw new Error("La vidéo reçue est incomplète ou illisible.");
        end = sample.timestamp + sample.duration;
      } finally { sample.close(); }
    }
    abort.throwIfAborted();
    if (!count || Math.abs(end - 10) > FRAME_TOLERANCE) throw new Error("La vidéo reçue est incomplète ou illisible.");
    return registerPreparedSocialVideo(file);
  } finally {
    abort.removeEventListener("abort", cancel);
    input.dispose();
  }
}
