import type {
  MarketingSocialFollowStatus,
  MarketingSocialVerificationStatus,
} from "../../supabase/functions/_shared/marketing-social-follow-contract";

export const SOCIAL_FOLLOW_LABELS: Record<MarketingSocialFollowStatus, string> = {
  unknown: "À contrôler",
  not_followed: "Non suivi",
  requested: "Demande envoyée",
  followed: "Suivi confirmé",
  ignored: "À ignorer",
};

export const SOCIAL_VERIFICATION_LABELS: Record<MarketingSocialVerificationStatus, string> = {
  needs_review: "Identité à vérifier",
  verified: "Identité confirmée",
  rejected: "Mauvais compte",
};

export const SOCIAL_SELECT_CLASS = "flex h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";
