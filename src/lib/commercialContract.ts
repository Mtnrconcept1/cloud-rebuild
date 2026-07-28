import {
  createCommercialCompensationSnapshot,
  type CommercialCompensationSnapshot,
} from "@/lib/commercialSales";

export const COMMERCIAL_CONTRACT_TITLE = "Contrat de collaboration commerciale TOK";
export const COMMERCIAL_CONTRACT_VERSION = "TOK-CH-COM-2026-08-v1";
export const COMMERCIAL_CONTRACT_EFFECTIVE_DATE = "2026-08-01";
export const COMMERCIAL_CONTRACT_LEGAL_STATUS = "draft_pending_swiss_legal_review" as const;
export const COMMERCIAL_CONTRACT_PAGE_COUNT = 3;

export type CommercialContractParty = {
  id: string;
  legalName: string;
  address: string;
  representativeName: string;
  representativeRole: string;
};

export type CommercialContractDocument = {
  title: typeof COMMERCIAL_CONTRACT_TITLE;
  version: typeof COMMERCIAL_CONTRACT_VERSION;
  effectiveDate: typeof COMMERCIAL_CONTRACT_EFFECTIVE_DATE;
  legalStatus: typeof COMMERCIAL_CONTRACT_LEGAL_STATUS;
  tokParty: CommercialContractParty;
  commercialParty: CommercialContractParty;
  compensationSnapshot: CommercialCompensationSnapshot;
  pages: typeof COMMERCIAL_CONTRACT_PAGES;
};

export const COMMERCIAL_CONTRACT_PAGES = [
  {
    number: 1,
    heading: "Identification et mission",
    clauses: [
      { title: "1. Parties et objet", text: "Le présent contrat lie TOK et le commercial identifiés dans le cartouche contractuel. Il est autonome et ne reprend ni n’incorpore le contrat de partenariat restaurateur. Le commercial accompagne la prospection, la présentation loyale de TOK, l’onboarding et le suivi des établissements attribués." },
      { title: "2. Mission et autonomie", text: "Le commercial organise son activité dans le cadre convenu, respecte les territoires et comptes attribués et consigne ses actions dans les outils TOK. Il ne peut engager TOK, promettre un tarif, accorder une remise, encaisser un paiement ou signer au nom de TOK sans mandat écrit exprès." },
      { title: "3. Obligations des parties", text: "Le commercial fournit des informations exactes, évite les pratiques trompeuses et signale tout conflit d’intérêts. TOK met à disposition les supports, accès et données strictement nécessaires, décide seul de l’acceptation d’un restaurant et conserve la maîtrise des prix, produits et contrats partenaires." },
      { title: "4. Qualification", text: "La qualification juridique de la relation, notamment indépendante ou salariée, dépend de la situation réellement convenue et des règles impératives suisses. Aucune clause ne peut écarter une requalification ou une obligation sociale imposée par une autorité compétente." },
    ],
  },
  {
    number: 2,
    heading: "Rémunération, attribution et commissions",
    clauses: [
      { title: "5. Barème figé", text: "La rémunération applicable est exclusivement celle de l’annexe tarifaire immuable jointe au contenu accepté. Pendant le sprint de 60 jours, aucun fixe n’est dû. Les commissions par signature sont Starter 120 CHF, Business 220 CHF, Premium 350 CHF et Elite 650 CHF; les bonus de sprint sont 500 CHF dès 10 signatures, 1’500 CHF dès 20, 2’500 CHF dès 30 et 4’000 CHF dès 40." },
      { title: "6. Engagement et équipe", text: "L’éligibilité à l’engagement intervient à 50 signatures, sous réserve d’une décision et d’une activation administratives. Une fois actif, le fixe mensuel est de 2’500 CHF pour un commercial engagé et 3’500 CHF pour un responsable d’équipe. Les commissions par signature deviennent Starter 60 CHF, Business 120 CHF, Premium 190 CHF et Elite 300 CHF." },
      { title: "7. Attribution et acquisition", text: "Une signature est attribuée selon le propriétaire du prospect et les données auditées dans TOK. La commission de signature reste en attente jusqu’au paiement restaurateur puis devient acquise selon la gouvernance commerciale. Les annulations, remboursements, doublons, fraudes, corrections et reprises sont traités par les statuts et journaux autoritaires; aucune saisie client ne crée une créance." },
      { title: "8. Réservations et relevés", text: "Après activation de la rémunération, une réservation personnelle honorée ouvre 0.10 CHF et, pour un responsable, une réservation honorée de son équipe ouvre 0.05 CHF, sur la base TOK de 5 CHF. Les réservations annulées, refusées, en attente ou no-show sont exclues. Les relevés TOK, contestables avec pièces, font foi sous réserve d’une erreur démontrée." },
    ],
  },
  {
    number: 3,
    heading: "Confidentialité, conformité, durée et signatures",
    clauses: [
      { title: "9. Confidentialité et données", text: "Chaque partie protège les informations non publiques, secrets d’affaires, listes de prospects, accès, données personnelles et conditions tarifaires. Le commercial utilise les données uniquement pour la mission, applique la LPD suisse et les instructions TOK, n’exporte pas les fichiers et restitue ou supprime les données à la fin de l’accès, sous réserve des obligations légales." },
      { title: "10. Conformité", text: "Sont interdits la corruption, les avantages indus, le démarchage trompeur, l’usurpation de mandat, les faux enregistrements et tout contournement des contrôles de sécurité. Les règles impératives suisses, fiscales, sociales, de concurrence et de protection des données demeurent réservées." },
      { title: "11. Durée et résiliation", text: "Le contrat prend effet à la date indiquée et est conclu pour une durée indéterminée. Chaque partie peut le résilier par écrit avec un préavis de 30 jours, sous réserve d’un régime impératif plus favorable. Une résiliation immédiate reste possible pour juste motif, violation grave, fraude, atteinte aux données ou aux accès. Les commissions déjà acquises restent dues; les montants seulement projetés ne le sont pas." },
      { title: "12. Droit applicable, preuve et signatures", text: "Le droit suisse est applicable. Le for est au siège de TOK sous réserve des fors impératifs. La version, les identifiants des parties, l’annexe, le hash SHA-256, l’horodatage et la preuve de consentement forment la preuve électronique. Le texte doit être relu et approuvé par un juriste suisse avant toute activation en production." },
    ],
  },
] as const;

export function buildCommercialContractDocument(
  tokParty: CommercialContractParty,
  commercialParty: CommercialContractParty,
): CommercialContractDocument {
  return {
    title: COMMERCIAL_CONTRACT_TITLE,
    version: COMMERCIAL_CONTRACT_VERSION,
    effectiveDate: COMMERCIAL_CONTRACT_EFFECTIVE_DATE,
    legalStatus: COMMERCIAL_CONTRACT_LEGAL_STATUS,
    tokParty,
    commercialParty,
    compensationSnapshot: createCommercialCompensationSnapshot(),
    pages: COMMERCIAL_CONTRACT_PAGES,
  };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function serializeCommercialContract(document: CommercialContractDocument) {
  return canonicalize(document);
}

export async function hashCommercialContract(document: CommercialContractDocument) {
  const bytes = new TextEncoder().encode(serializeCommercialContract(document));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
