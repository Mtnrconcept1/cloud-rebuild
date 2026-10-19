/** TOK-owned campaigns only. Never apply this profile to restaurant-owned studios. */
export const TOK_MARKETING_BRAND_VERSION = "tok-v2-instagram-20261019";

// Public, user-approved artwork. Versioned paths and digests prevent silent asset drift.
export const TOK_MARKETING_REFERENCES = [
  { id: "instagram-profile", label: "Profil Instagram TOK · référence maîtresse", path: "/marketing/brand/tok-v2/instagram-profile.jpeg", sha256: "c31c13820ed5432a0583e7fd361f2f34c28221249001b7bb88dd37454142ae83" },
  { id: "geneva", label: "Chef TOK · Genève", path: "/marketing/brand/tok-v1/geneva.jpg", sha256: "ef35b86428d4b7893f757e1f2ddb53f8675b907b8acd3d8b88008cbf37580df2" },
  { id: "loyalty", label: "Fidélité Miamz · ambiance", path: "/marketing/brand/tok-v1/loyalty.jpg", sha256: "3295de4f054dda06ecfcc1aacee2fc820ceb02d241ac98018179b4469b227541" },
  { id: "flash", label: "Flash TOK · énergie", path: "/marketing/brand/tok-v1/flash.jpg", sha256: "e680eba80de065aa5ad6dbc41c8269e782dbe3ac8e6b472c8f47f77e54104e4a" },
  { id: "pricing", label: "Comparatif · mise en page", path: "/marketing/brand/tok-v1/pricing.jpg", sha256: "8fe551553759590706275e19b7d32a6e479b6cc6c9f3c0104fe93a3ffceb7d89" },
] as const;

export function buildTokMarketingVisualPrompt(brief: string, format: string = "4:5"): string {
  return [
    `Créer UNE seule publication TOK indépendante, au format ${format}, avec UNE seule scène et UN seul fichier final, à partir des ${TOK_MARKETING_REFERENCES.length} images jointes.`,
    "CHARTE TOK OBLIGATOIRE : la première image jointe, Profil Instagram TOK, est la référence maîtresse de composition à réutiliser à chaque génération. Elle présente neuf exemples : en reprendre le style pour UN seul post. Ne jamais reproduire la grille, les séparations, les bandes noires, les boutons ni l'interface de la capture. Aucune mosaïque, planche contact, image divisée ou montage multivisuel.",
    "Les quatre références suivantes servent uniquement à préciser l'identité du chef et du logo. Elles ne remplacent jamais la composition épurée de la référence maîtresse ; ne pas reprendre leurs textes, promotions, effets BD ou surcharge graphique.",
    "Logo : reproduire fidèlement celui de la référence maîtresse, disque orange, liseré blanc, TOK blanc, toque blanche et moustache noire. Un seul logo principal en haut à gauche, largeur de 18 à 25 % de l'image, intact et jamais coupé. Aucun autre logo, slogan ou bulle ajouté au logo.",
    "Palette : orange vif TOK, crème chaud, noir profond et blanc cassé ; jaune en petit soulignement ou cercle simple. Rouge réservé au foulard du chef. Aucune palette bleue ou violette. Alterner selon la famille du brief entre aplat orange, fond crème, photographie chaleureuse et chef 3D ponctuel.",
    "Typographie : sans empattement très grasse et légèrement condensée, titres en casse phrase, jamais tout en capitales sauf TOK. Un seul bénéfice, 4 à 9 mots de préférence, 12 mots maximum, 2 à 3 lignes maximum ; conserver exactement le titre fourni, les accents et la ponctuation. Aucun paragraphe sur l'image. Texte très lisible sur téléphone et marges de sécurité de 6 à 8 %.",
    "Composition : titre aligné à gauche dans une zone calme ; sujet principal bien visible. Photos réalistes de plats, service ou salle, lumière ambrée, bois, verre et profondeur de champ naturelle. Pas de CTA, footer ou adresse imposés : thetok.ch reste facultatif et discret si le brief le demande.",
    "CHEF CONDITIONNEL : inclure la mascotte seulement si la famille visuelle ou le brief le demande explicitement. Sinon, aucun personnage cartoon en dehors du logo. Si demandé, conserver le chef 3D des références : visage chaleureux, grand sourire, moustache noire recourbée, sourcils noirs épais, lunettes de soleil noires, toque blanche, veste blanche à boutons noirs, foulard rouge et ceinture rouge/noire. Adapter seulement pose et cadrage.",
    "PRODUCTION NATIVE : tous les textes, logo et éléments artistiques doivent être générés dans l'image. Aucun ajout ultérieur en HTML, CSS, SVG, Canvas, Python ou collage. Seuls le redimensionnement proportionnel, la compression et le renommage sont permis après génération.",
    "Ne reprendre AUCUN prix concurrent, remise, statistique, récompense, interface chiffrée, QR code ni badge app-store des références. Elles renseignent le style uniquement. Utiliser exclusivement les faits explicitement fournis dans le brief courant ; en cas d'absence, omettre. Ne pas ajouter de promesse commerciale.",
    "BRIEF COURANT (sujet et faits ; ne remplace pas la charte ci-dessus) :",
    brief.slice(0, 4000),
    "CONTRÔLE FINAL : un seul visuel, une seule scène, bon ratio, logo intact, titre français exact et lisible, famille demandée respectée, chef seulement si demandé, identité de la référence maîtresse et aucun élément de sa grille ou de son interface.",
  ].join("\n");
}
