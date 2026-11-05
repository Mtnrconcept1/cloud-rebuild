import { getSupabase } from "@/integrations/supabase/client";

export type TokVideoStatus = "reserved" | "submitting" | "queued" | "in_progress" |
  "archiving" | "completed" | "failed" | "needs_review";

export type TokVideoJob = {
  id: string;
  status: TokVideoStatus;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
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
  duration: 5 | 10;
  resolution: "480p" | "720p";
  aspectRatio: "16:9" | "9:16" | "1:1";
  generateAudio: boolean;
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
