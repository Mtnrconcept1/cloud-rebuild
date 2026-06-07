export const GOOGLE_BOOKING_STATUS_LABELS = {
  not_configured: "Non configuré",
  link_copied: "Lien copié",
  in_progress: "En cours",
  configured: "Configuré",
  problem: "Problème",
} as const;

export const GOOGLE_BOOKING_STATUS_MESSAGES = {
  not_configured: "Votre bouton Google n'est pas encore relié à TOK.",
  link_copied: "Lien copié. Il reste à l'ajouter dans votre fiche Google Business.",
  in_progress: "Configuration en cours. TOK peut vous accompagner si besoin.",
  configured: "Votre bouton Google est indiqué comme configuré.",
  problem: "Un problème a été signalé. Contactez TOK ou vérifiez votre fiche Google.",
} as const;

export const GOOGLE_BOOKING_STATUS_TONES = {
  not_configured: "bg-slate-100 text-slate-700 border-slate-200",
  link_copied: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  configured: "bg-emerald-50 text-emerald-700 border-emerald-200",
  problem: "bg-red-50 text-red-700 border-red-200",
} as const;

export const PREVIOUS_BOOKING_PROVIDER_OPTIONS = [
  { value: "unknown", label: "Je ne sais pas" },
  { value: "thefork", label: "TheFork" },
  { value: "other", label: "Autre fournisseur" },
  { value: "none", label: "Aucun" },
] as const;

export type GoogleBookingStatus = keyof typeof GOOGLE_BOOKING_STATUS_LABELS;
export type PreviousBookingProvider = (typeof PREVIOUS_BOOKING_PROVIDER_OPTIONS)[number]["value"];
export type GoogleBookingAction = "copy" | "help" | "configured" | "problem" | "save";

export type GoogleBusinessBookingSetup = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  city: string | null;
  google_place_id?: string | null;
  google_business_url: string | null;
  booking_slug: string;
  tok_booking_url: string;
  previous_booking_provider: PreviousBookingProvider | null;
  google_booking_status: GoogleBookingStatus;
  needs_google_help: boolean;
  copied_at: string | null;
  preferred_link_confirmed_at: string | null;
  confirmation_screenshot_url: string | null;
  created_at: string;
  updated_at: string;
  link_clicks: number;
  reservation_starts: number;
  reservation_completions: number;
};

export type AdminGoogleBusinessBookingSetup = GoogleBusinessBookingSetup & {
  admin_notes: string | null;
  last_admin_contact_at: string | null;
};

export function isHttpsUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return !trimmed || /^https:\/\//i.test(trimmed);
}

export function normalizeOptionalHttpsUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || "";
}

export function getGoogleBookingStatusLabel(status: string | null | undefined) {
  return GOOGLE_BOOKING_STATUS_LABELS[(status || "not_configured") as GoogleBookingStatus] || GOOGLE_BOOKING_STATUS_LABELS.not_configured;
}

export function getGoogleBookingStatusMessage(status: string | null | undefined) {
  return GOOGLE_BOOKING_STATUS_MESSAGES[(status || "not_configured") as GoogleBookingStatus] || GOOGLE_BOOKING_STATUS_MESSAGES.not_configured;
}

export function getGoogleBookingStatusTone(status: string | null | undefined) {
  return GOOGLE_BOOKING_STATUS_TONES[(status || "not_configured") as GoogleBookingStatus] || GOOGLE_BOOKING_STATUS_TONES.not_configured;
}

export function formatGoogleBookingDate(value?: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-CH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
