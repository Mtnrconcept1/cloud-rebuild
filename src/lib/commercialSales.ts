export const COMMERCIAL_REFUSAL_REASONS = [
  { value: "price_too_high", label: "Prix de l’abonnement trop élevé" },
  { value: "commission_too_high", label: "Commission TOK jugée trop élevée" },
  { value: "already_with_competitor", label: "Déjà équipé par un concurrent" },
  { value: "no_need", label: "Ne perçoit pas le besoin" },
  { value: "no_time", label: "Manque de temps pour étudier l’offre" },
  { value: "decision_maker_absent", label: "Décideur absent ou indisponible" },
  { value: "consult_partner", label: "Doit consulter un associé ou le siège" },
  { value: "contract_too_restrictive", label: "Conditions contractuelles jugées contraignantes" },
  { value: "tools_not_useful", label: "Fonctionnalités jugées peu utiles" },
  { value: "unclear_roi", label: "Retour sur investissement insuffisamment clair" },
  { value: "tok_not_known_enough", label: "TOK manque encore de notoriété" },
  { value: "refuses_digital", label: "Refus ou difficulté avec les outils numériques" },
  { value: "previous_bad_experience", label: "Mauvaise expérience avec une solution similaire" },
  { value: "technical_constraints", label: "Contraintes techniques ou d’intégration" },
  { value: "budget_unavailable", label: "Budget indisponible actuellement" },
  { value: "seasonal_or_closing", label: "Activité saisonnière, vente ou fermeture prévue" },
  { value: "other", label: "Autre motif" },
] as const;

/**
 * Authoritative client-side mirror of the compensation rules implemented by
 * commercial_signature_commission_chf, commercial_sprint_bonus_chf and
 * get_commercial_compensation_summary. Contract snapshots must copy these
 * values and never derive them from display copy.
 */
export const COMMERCIAL_COMPENSATION_RULES = Object.freeze({
  currency: "CHF",
  sprintDurationDays: 60,
  engagementSignatureTarget: 50,
  monthlySalaryChf: Object.freeze({ engaged: 2_500, teamLead: 3_500 }),
  signatureCommissionChf: Object.freeze({
    sprint: Object.freeze({ starter: 120, business: 220, premium: 350, elite: 650 }),
    engaged: Object.freeze({ starter: 60, business: 120, premium: 190, elite: 300 }),
  }),
  sprintBonusChf: Object.freeze([
    Object.freeze({ minimumSignatures: 10, amountChf: 500 }),
    Object.freeze({ minimumSignatures: 20, amountChf: 1_500 }),
    Object.freeze({ minimumSignatures: 30, amountChf: 2_500 }),
    Object.freeze({ minimumSignatures: 40, amountChf: 4_000 }),
  ]),
  honoredReservationCommissionChf: Object.freeze({ personal: 0.1, teamLead: 0.05 }),
  tokReservationBaseChf: 5,
} as const);

export type CommercialCompensationSnapshot = typeof COMMERCIAL_COMPENSATION_RULES;

export function createCommercialCompensationSnapshot(): CommercialCompensationSnapshot {
  return JSON.parse(JSON.stringify(COMMERCIAL_COMPENSATION_RULES)) as CommercialCompensationSnapshot;
}

export type CommercialRefusalReasonCode = (typeof COMMERCIAL_REFUSAL_REASONS)[number]["value"];

const COMMERCIAL_REFUSAL_REASON_LABELS = new Map<string, string>(
  [
    ...COMMERCIAL_REFUSAL_REASONS.map((reason) => [reason.value, reason.label] as const),
    ["not_interested_unspecified", "Refus historique sans motif précisé"] as const,
  ],
);

export function getCommercialRefusalReasonLabel(code: string) {
  return COMMERCIAL_REFUSAL_REASON_LABELS.get(code) || code;
}

export const COMMERCIAL_FOLLOWUP_STATUS_LABELS = {
  not_visited: "À visiter",
  visited: "Visité",
  in_progress: "À repasser",
  signed: "Signé",
  not_interested: "Refusé",
} as const;

export function getCommercialFollowupStatusLabel(status: string) {
  return COMMERCIAL_FOLLOWUP_STATUS_LABELS[status as keyof typeof COMMERCIAL_FOLLOWUP_STATUS_LABELS] || status;
}
