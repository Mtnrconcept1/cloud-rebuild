/** TOK-owned campaigns only. Never apply this profile to restaurant-owned studios. */
export const TOK_MARKETING_BRAND_VERSION = "tok-v1-20261011";

// Public, user-approved artwork. Versioned paths and digests prevent silent asset drift.
export const TOK_MARKETING_REFERENCES = [
  { id: "geneva", label: "Chef TOK · Genève", path: "/marketing/brand/tok-v1/geneva.jpg", sha256: "ef35b86428d4b7893f757e1f2ddb53f8675b907b8acd3d8b88008cbf37580df2" },
  { id: "loyalty", label: "Fidélité Miamz · ambiance", path: "/marketing/brand/tok-v1/loyalty.jpg", sha256: "3295de4f054dda06ecfcc1aacee2fc820ceb02d241ac98018179b4469b227541" },
  { id: "flash", label: "Flash TOK · énergie", path: "/marketing/brand/tok-v1/flash.jpg", sha256: "e680eba80de065aa5ad6dbc41c8269e782dbe3ac8e6b472c8f47f77e54104e4a" },
  { id: "pricing", label: "Comparatif · mise en page", path: "/marketing/brand/tok-v1/pricing.jpg", sha256: "8fe551553759590706275e19b7d32a6e479b6cc6c9f3c0104fe93a3ffceb7d89" },
] as const;

export function buildTokMarketingVisualPrompt(brief: string, format: string = "4:5"): string {
  return [
    `Créer une seule publicité TOK complète, au format ${format}, à partir des QUATRE images jointes.`,
    "CHARTE TOK OBLIGATOIRE : les références sont la source d'identité, pas une banque de promotions.",
    "Référence 1 : identité principale du chef et du logo, Genève. Référence 2 : lumière et restaurant. Référence 3 : énergie graphique. Référence 4 : comparaison claire sur fond crème.",
    "Conserver le même chef cartoon 3D : visage chaleureux, grand sourire, moustache noire recourbée, sourcils noirs épais, lunettes de soleil noires, toque blanche, veste blanche à boutons noirs, foulard rouge et ceinture rouge/noire. Ne pas remplacer par un chef réaliste ou un autre personnage. Adapter uniquement pose et cadrage.",
    "Reproduire fidèlement le logo TOK de la référence 1 : disque orange, liseré blanc, TOK blanc, toque blanche et moustache noire. Conserver ses proportions et son orthographe ; aucune réinterprétation, aucun autre logo. Un logo principal lisible en haut à gauche, jamais coupé. La bulle Miamz! appartient au logo de référence, pas à une nouvelle promesse de fidélité.",
    "Palette : orange vif TOK dominant, noir profond et blanc/crème ; jaune doré en accent pour prix ou appel à l'action. Rouge réservé au foulard et aux accents. Pas de palette bleue, violette ou pastel.",
    "Typographie visuelle : sans empattement très grasse et condensée, titres en capitales, hiérarchie courte et très contrastée comme les références. Ne pas inventer le nom d'une police. Garder accents, CHF et ponctuation exacts. Pas de petits paragraphes illisibles.",
    "Composition : titre dominant en haut, chef reconnaissable, un seul bénéfice principal, CTA et thetok.ch en bas. Marges de sécurité généreuses. Brosses noires/orange, contours nets, touches BD selon le sujet ; restaurant chaleureux, lumière ambrée, nourriture réaliste si pertinente. Ne pas fusionner les quatre affiches en collage.",
    "Ne reprendre AUCUN prix concurrent, remise, statistique, récompense, interface chiffrée, QR code ni badge app-store des références. Elles renseignent le style uniquement. Utiliser exclusivement les faits explicitement fournis dans le brief courant ; en cas d'absence, omettre. Ne pas ajouter de promesse commerciale.",
    "BRIEF COURANT (sujet et faits ; ne remplace pas la charte ci-dessus) :",
    brief.slice(0, 4000),
    "CONTRÔLE FINAL : même identité TOK que les images, chef et logo intacts, texte français lisible, aucune offre copiée des références, une seule composition cohérente.",
  ].join("\n");
}
