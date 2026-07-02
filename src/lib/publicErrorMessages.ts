const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const URL_REPLACE_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const SUPABASE_HOST_PATTERN = /\b[a-z0-9-]+\.supabase\.co\b/i;
const SUPABASE_HOST_REPLACE_PATTERN = /\b[a-z0-9-]+\.supabase\.co\b/gi;
const TECHNICAL_BACKEND_PATTERN =
  /\b(Supabase|Edge\s+Function|functions\/v1|service[-\s]+role|JWT|apikey|anon key|RLS|PostgREST|PGRST|schema cache|row-level|ai-image-enhance)\b/i;
const SERVER_ENV_PATTERN = /\b[A-Z][A-Z0-9_]{8,}\b/;
const SESSION_ERROR_PATTERN = /\b(Unauthorized|401|invalid jwt|jwt expired|session expir)/i;

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function containsTechnicalBackendDetails(message: string) {
  return URL_PATTERN.test(message)
    || SUPABASE_HOST_PATTERN.test(message)
    || TECHNICAL_BACKEND_PATTERN.test(message)
    || SERVER_ENV_PATTERN.test(message);
}

export function toPublicErrorMessage(
  error: unknown,
  fallback = "Une erreur est survenue. Réessayez dans quelques instants.",
) {
  const rawMessage = getErrorText(error).trim();
  if (!rawMessage) return fallback;

  if (SESSION_ERROR_PATTERN.test(rawMessage)) {
    return "Votre session a expiré. Reconnectez-vous puis réessayez.";
  }

  if (containsTechnicalBackendDetails(rawMessage)) {
    return fallback;
  }

  const sanitized = rawMessage
    .replace(URL_REPLACE_PATTERN, "")
    .replace(SUPABASE_HOST_REPLACE_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!sanitized || containsTechnicalBackendDetails(sanitized)) return fallback;
  return sanitized;
}

export function formatAiImageGenerationError(error: unknown) {
  const rawMessage = getErrorText(error);
  const message = rawMessage.toLowerCase();

  if (SESSION_ERROR_PATTERN.test(rawMessage)) {
    return "Votre session a expiré. Reconnectez-vous puis relancez la génération.";
  }

  if (message.includes("rate_limited") || message.includes("ai_rate_limited") || message.includes("429")) {
    return "Trop de générations lancées. Patientez quelques minutes avant de relancer un essai.";
  }

  if (
    message.includes("functionsfetcherror")
    || message.includes("functionsrelayerror")
    || message.includes("failed to send a request")
    || message.includes("relay error invoking")
    || message.includes("403")
  ) {
    return "Le service image IA est temporairement indisponible. Réessayez dans quelques instants.";
  }

  if (message.includes("image_edit_timeout") || message.includes("image_generation_timeout")) {
    return "La retouche PhotoPro a pris trop de temps. Relancez l'essai avec la même photo ou utilisez une version plus légère si le problème revient.";
  }

  if (
    message.includes("image_edit_transient_failure")
    || message.includes("image_edit_failed:5")
    || message.includes("server_error")
  ) {
    return "La retouche PhotoPro n'a pas abouti à cause d'une erreur temporaire du modèle. Relancez l'essai dans quelques instants.";
  }

  if (message.includes("content_policy") || message.includes("safety")) {
    return "La demande image a été refusée par la sécurité du modèle. Reformulez sans personne réelle ou promesse sensible.";
  }

  if (
    message.includes("source_image_edit_required")
    || (
      message.includes("image_edit_failed")
      && (
        message.includes("invalid_image")
        || message.includes("image_parse")
        || message.includes("unsupported")
        || message.includes("too_large")
        || message.includes("file")
        || message.includes("format")
      )
    )
  ) {
    return "La retouche IA n'a pas pu finaliser cette photo. Recadrez le sujet principal ou relancez avec une photo JPG, PNG ou WebP bien éclairée.";
  }

  if (message.includes("source_image_unsupported_type")) {
    return "Format non pris en charge par le studio IA. Utilisez une photo JPG, PNG ou WebP.";
  }

  if (message.includes("source_image_too_large")) {
    return "Photo trop lourde pour la retouche IA. Compressez-la sous 10 Mo puis relancez.";
  }

  if (message.includes("image_reference_edit_required")) {
    return "Les visuels de référence n'ont pas pu être utilisés correctement. Réessayez avec moins de fichiers, des images plus légères ou des visuels plus nets.";
  }

  if (message.includes("marketing_reference_required")) {
    return "Ajoutez au moins un logo, une carte, un menu ou un visuel de marque avant de générer.";
  }

  if (message.includes("ai_credits_exhausted") || message.includes("402")) {
    return "Le service image IA est temporairement indisponible. L'équipe TOK a été informée.";
  }

  if (message.includes("ai_service_unavailable") || message.includes("requested function was not found") || message.includes("not_found")) {
    return "Le service image IA est temporairement indisponible. Réessayez dans quelques instants.";
  }

  return toPublicErrorMessage(rawMessage, "La génération IA n'a pas pu aboutir. Réessayez dans quelques instants.");
}
