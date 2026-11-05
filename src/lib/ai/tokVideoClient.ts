import { getSupabase } from "@/integrations/supabase/client";
import {
  DEFAULT_TOK_VIDEO_MARKETING_SETTINGS,
  TOK_VIDEO_ASPECT_RATIOS,
  TOK_VIDEO_BITRATE_MODES,
  TOK_VIDEO_CREATIVE_FORMATS,
  TOK_VIDEO_OUTPUT_FORMATS,
  TOK_VIDEO_RESOLUTIONS,
  type TokVideoMarketingSettings,
} from "../../../supabase/functions/_shared/higgsfield-marketing-settings";

export type { TokVideoMarketingSettings };
export type TokVideoResolution = "480p" | "720p" | "1080p";
export type TokVideoAspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
export type TokVideoOutputFormat = "mp4" | "mov";
export type TokVideoBitrateMode = "standard" | "high";

export type TokVideoStudioDraft = {
  version: 2;
  duration: number;
  resolution: TokVideoResolution;
  aspectRatio: TokVideoAspectRatio;
  outputFormat: TokVideoOutputFormat;
  bitrateMode: TokVideoBitrateMode;
  interpretation: boolean;
  marketing: TokVideoMarketingSettings;
};

export function createTokVideoStudioDraft(): TokVideoStudioDraft {
  return {
    version: 2,
    duration: 10,
    resolution: "720p",
    aspectRatio: "9:16",
    outputFormat: "mp4",
    bitrateMode: "standard",
    interpretation: false,
    marketing: { ...DEFAULT_TOK_VIDEO_MARKETING_SETTINGS },
  };
}

/** Restore incomplete drafts too: selecting voiceover must not erase an unfinished script. */
export function readTokVideoStudioDraft(raw: string | null): TokVideoStudioDraft {
  const fallback = createTokVideoStudioDraft();
  try {
    const row: unknown = JSON.parse(raw || "null");
    if (!row || typeof row !== "object" || Array.isArray(row) || !("version" in row) || row.version !== 2) return fallback;
    const value = row as Record<string, unknown>;
    const marketing = value.marketing && typeof value.marketing === "object" && !Array.isArray(value.marketing)
      ? value.marketing as Record<string, unknown> : {};
    const text = (name: string, max: number) => typeof marketing[name] === "string" ? marketing[name].slice(0, max) : "";
    const reference = (name: string) => typeof marketing[name] === "string" && marketing[name].length <= 100 ? marketing[name] : null;
    const choose = <T extends string>(candidate: unknown, choices: readonly T[], defaultValue: T): T =>
      choices.includes(candidate as T) ? candidate as T : defaultValue;
    return {
      version: 2,
      duration: typeof value.duration === "number" && Number.isInteger(value.duration) && value.duration >= 4 && value.duration <= 30 ? value.duration : fallback.duration,
      resolution: choose(value.resolution, TOK_VIDEO_RESOLUTIONS, fallback.resolution),
      aspectRatio: choose(value.aspectRatio, TOK_VIDEO_ASPECT_RATIOS, fallback.aspectRatio),
      outputFormat: choose(value.outputFormat, TOK_VIDEO_OUTPUT_FORMATS, fallback.outputFormat),
      bitrateMode: choose(value.bitrateMode, TOK_VIDEO_BITRATE_MODES, fallback.bitrateMode),
      interpretation: value.interpretation === true,
      marketing: {
        creativeFormat: choose(marketing.creativeFormat, TOK_VIDEO_CREATIVE_FORMATS.map((item) => item.id), fallback.marketing.creativeFormat),
        productDescription: text("productDescription", 5000),
        hook: text("hook", 500),
        setting: text("setting", 500),
        productMediaId: reference("productMediaId"),
        avatarMediaId: reference("avatarMediaId"),
        startImageMediaId: reference("startImageMediaId"),
        endImageMediaId: reference("endImageMediaId"),
        audioMode: choose(marketing.audioMode, ["silent", "ambient", "voiceover"] as const, "silent"),
        language: choose(marketing.language, ["fr", "en", "de", "it"] as const, "fr"),
        voiceoverText: text("voiceoverText", 1000),
        callToAction: text("callToAction", 160),
      },
    };
  } catch { return fallback; }
}

export type TokVideoStatus = "reserved" | "submitting" | "queued" | "in_progress" |
  "archiving" | "completed" | "failed" | "needs_review";

export type TokVideoJob = {
  id: string;
  idempotencyKey?: string;
  status: TokVideoStatus;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  outputFormat?: TokVideoOutputFormat;
  bitrateMode?: TokVideoBitrateMode;
  marketing?: TokVideoMarketingSettings | null;
  credits: number;
  model: string;
  referenceMediaId: string | null;
  referenceMediaIds?: string[];
  logoMediaId?: string | null;
  errorCode: string | null;
  canRefreshStatus?: boolean;
  createdAt: string;
  updatedAt: string;
  videoUrl: string | null;
};

export type TokVideoOptionsInput = {
  prompt: string;
  duration: number;
  resolution: TokVideoResolution;
  aspectRatio: TokVideoAspectRatio;
  generateAudio: boolean;
  outputFormat?: TokVideoOutputFormat;
  bitrateMode?: TokVideoBitrateMode;
  marketing?: TokVideoMarketingSettings;
  referenceMediaId: string | null;
  referenceMediaIds?: string[];
  logoMediaId?: string | null;
  allowInterpretation?: boolean;
};

export type TokVideoQuote = {
  credits: number;
  estimatedProviderChf: number;
  maxChargedChf: number;
  model: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  video_quote_changed: "Le devis a changé. Demandez un nouveau devis et confirmez son montant avant de générer.",
  video_reference_required: "Sélectionnez une photo de votre restaurant avant de générer une vidéo.",
  video_references_invalid: "Choisissez entre une et six photos distinctes dans votre galerie.",
  video_reel_format_required: "Les reels utilisent le format vertical 9:16, 720p et une durée de 10 secondes.",
  video_logo_invalid: "Choisissez le logo séparément des photos à animer.",
  video_interpretation_consent_required: "Confirmez le mode Animation IA, ou choisissez Reel fidèle pour préserver vos originaux.",
  idempotency_conflict: "Cette demande a déjà été envoyée avec d'autres références. Vérifiez l'historique.",
  video_prompt_invalid: "Décrivez votre publicité en 12 à 1 000 caractères.",
  video_duration_invalid: "Choisissez une durée entière entre 4 et 30 secondes.",
  video_resolution_invalid: "Choisissez une résolution 480p, 720p ou 1080p.",
  video_aspect_ratio_invalid: "Choisissez l'un des formats vidéo proposés.",
  video_output_format_invalid: "Choisissez un fichier MP4 ou MOV.",
  video_bitrate_invalid: "Choisissez un débit vidéo standard ou renforcé.",
  video_marketing_invalid: "Vérifiez les réglages de votre publicité.",
  video_marketing_settings_invalid: "Vérifiez les champs et la longueur des textes de votre publicité.",
  video_marketing_format_invalid: "Choisissez un format créatif proposé par le studio.",
  video_marketing_language_invalid: "Choisissez le français, l'anglais, l'allemand ou l'italien pour la voix off.",
  video_marketing_reference_invalid: "Une référence du sujet, du présentateur ou des plans a été retirée. Sélectionnez-la à nouveau parmi vos photos.",
  video_voiceover_required: "Saisissez le texte exact de la voix off avant de demander le devis.",
  video_audio_invalid: "Vérifiez le mode sonore et les consignes de voix off.",
  video_audio_mode_mismatch: "Le mode sonore a changé. Vérifiez vos réglages et demandez un nouveau devis.",
  video_quote_limit_exceeded: "Cette combinaison dépasse le plafond de crédits par vidéo. Réduisez la durée ou la résolution et demandez un nouveau devis.",
  ai_credits_exhausted: "Crédits TOK insuffisants pour cette vidéo.",
  video_generation_already_active: "Une vidéo est déjà en cours pour ce restaurant.",
  video_daily_limit: "Limite de trois vidéos par restaurant sur 24 heures atteinte.",
  higgsfield_not_configured: "Le fournisseur vidéo n’est pas configuré pour ce studio.",
  video_reference_unavailable: "La photo de référence ne peut pas être utilisée.",
  video_reference_not_found: "Cette photo n’appartient pas au restaurant.",
  video_submission_claim_failed: "La génération n’a pas pu être confirmée.",
  video_reservation_failed: "Le devis n’a pas pu être réservé. Aucun nouvel essai automatique.",
  video_internal_error: "Le studio vidéo est momentanément indisponible.",
  unauthorized: "Reconnectez-vous pour accéder au studio.",
};

export function mergeTokVideoJobs(current: TokVideoJob[], incoming: TokVideoJob[]): TokVideoJob[] {
  const merged = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    const previous = merged.get(job.id);
    const terminal = previous?.status === "completed" || previous?.status === "failed";
    const isTerminal = job.status === "completed" || job.status === "failed";
    if (!previous || (Date.parse(job.updatedAt) >= Date.parse(previous.updatedAt) && (!terminal || isTerminal))) {
      merged.set(job.id, job);
    }
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20);
}

export async function requestTokVideo<T extends object>(
  restaurantId: string,
  input: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke("ai-video-studio", {
    body: { restaurantId, ...input },
  });
  if (error) {
    let code = "";
    try {
      const response = (error as { context?: Response }).context;
      if (response && typeof response.json === "function") {
        const payload = await response.json() as { error?: string };
        code = payload.error || "";
      }
    } catch {
      // Network errors may have occurred after provider submission.
    }
    throw new Error(ERROR_MESSAGES[code] || (code ? "Erreur vidéo : " + code : "Impossible de contacter le Studio vidéo. Vérifiez votre historique avant de relancer."));
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new Error(ERROR_MESSAGES[data.error] || data.error);
  }
  return data as T;
}
