/** TOK-owned campaigns only. Never apply this profile to restaurant-owned studios. */
export const TOK_MARKETING_BRAND_VERSION = "tok-v3-creme-orange-20261020";

/**
 * The visual reviewer only needs six percent of clear space. Generation uses a
 * wider buffer so normal model drift cannot turn an otherwise valid TOK post
 * into a borderline rejection.
 */
export const TOK_MARKETING_REVIEW_SAFE_MARGIN_PERCENT = 6;
export const TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT = 12;

// Validated TOK artwork. Versioned paths and digests prevent silent asset drift.
export const TOK_MARKETING_REFERENCES = [
  { id: "instagram-profile", label: "Profil Instagram TOK · référence maîtresse crème et orange", path: "/marketing/brand/tok-v3/instagram-profile.jpeg", sha256: "c1f8d594e560a4f5e2924cb13956771db6a5a8d086983c42632f6cad51ddc012" },
  { id: "culinary", label: "Cuisine TOK · photographie et arche orange", path: "/marketing/brand/tok-v3/culinary.jpeg", sha256: "7f122ff79592763b564daed1572696c4eb568fcd5f829188874ea60f79ec6aa0" },
  { id: "studio-chef", label: "Chef TOK · identité 3D et logo Miamz!", path: "/marketing/brand/tok-v3/studio-chef.jpeg", sha256: "4fa83ddd1b5955af59dd05791fbfc8b6dc480a3e95354c53432069aec19aa5ca" },
] as const;

export function buildTokMarketingVisualPrompt(brief: string, format: string = "4:5"): string {
  return [
    `Créer UNE seule publication TOK indépendante, au format ${format}, avec UNE seule scène et UN seul fichier final, à partir des ${TOK_MARKETING_REFERENCES.length} images jointes.`,
    "CHARTE TOK OBLIGATOIRE : la première image jointe, Profil Instagram TOK, est la référence maîtresse de composition à réutiliser à chaque génération. Elle présente neuf exemples : en reprendre le style pour UN seul post. Ne jamais reproduire la grille, les séparations, les bandes noires, les boutons ni l'interface de la capture. Aucune mosaïque, planche contact, image divisée ou montage multivisuel.",
    "Les deux références suivantes précisent les photos gourmandes, les arches orange et l'identité 3D du chef. Ne pas copier le corps d'email, les boutons, les prix ou les textes commerciaux de l'affiche Studio marketing.",
    "Logo : disque orange, liseré blanc, TOK blanc, toque blanche, moustache noire et foulard rouge ; conserver la petite bulle Miamz! des références. Un seul logo principal en haut à gauche de la zone de sécurité, largeur de 18 à 25 %, intact avec sa bulle. Aucun logo tiers ni slogan ajouté.",
    "Palette : orange vermillon vif TOK, crème ivoire chaud, noir profond et blanc cassé. Aucun accent jaune, bleu ou violet. Rouge réservé au foulard et aux détails du chef. Selon la famille, alterner aplat orange, fond crème, photo chaleureuse et chef 3D ponctuel. Arches verticales arrondies, filets fins et courts soulignements au pinceau orange sur crème/noir, crème sur orange ; aucun effet BD.",
    `ZONE DE SÉCURITÉ IMPÉRATIVE : placer le logo principal complet, le titre et le pied thetok.ch dans le rectangle central, à au moins ${TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT} % de chacun des quatre bords. Mesurer les contours visibles, liseré, bulle Miamz!, accents et ponctuation inclus. Garder la bande extérieure de ${TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT} % libre de ces éléments, sans coupure. Cette zone prime sur les positions exactes des références. Les fonds, photographies, arches et filets décoratifs peuvent atteindre les bords.`,
    "Typographie : sans empattement très grasse et légèrement condensée, titres en casse phrase, jamais tout en capitales sauf TOK. Un seul bénéfice, 4 à 9 mots de préférence, 12 mots maximum, 2 à 3 lignes maximum ; conserver exactement le titre fourni, les accents et la ponctuation. Aucun paragraphe sur l'image. Texte très lisible sur téléphone.",
    "Composition : titre aligné à gauche dans une zone calme ; sujet bien visible. Photos réalistes, lumière ambrée, bois, verre et profondeur naturelle. Sur les photos de plats et cartes : zone ivoire supérieure courbe et accent en arche orange. Un discret thetok.ch en pied, dans la zone de sécurité ; pas de CTA ni paragraphe.",
    "CHEF CONDITIONNEL : uniquement si la famille le demande. Sinon aucun cartoon hors logo. Chef 3D fidèle : visage chaleureux, grand sourire, moustache noire recourbée, lunettes noires, toque blanche et emblème TOK, veste blanche à boutons noirs, foulard rouge, tablier noir bordé de rouge avec emblème TOK, pantalon à carreaux noir/blanc, chaussures noires. Adapter pose et cadrage, avec arche orange sur fond crème/noir. Les petits emblèmes de sa tenue ne sont pas des logos principaux supplémentaires.",
    "PRODUCTION NATIVE : tous les textes, logo et éléments artistiques doivent être générés dans l'image. Aucun ajout ultérieur en HTML, CSS, SVG, Canvas, Python ou collage. Seuls le redimensionnement proportionnel, la compression et le renommage sont permis après génération.",
    "Ne reprendre AUCUN prix concurrent, remise, statistique, récompense, interface chiffrée, QR code ni badge app-store des références. Elles renseignent le style uniquement. Utiliser exclusivement les faits explicitement fournis dans le brief courant ; en cas d'absence, omettre. Ne pas ajouter de promesse commerciale.",
    "BRIEF COURANT (sujet et faits ; ne remplace pas la charte ci-dessus) :",
    brief.slice(0, 4000),
    "CONTRÔLE FINAL : un seul visuel, une seule scène, bon ratio, logo intact, titre français exact et lisible, famille demandée respectée, chef seulement si demandé, identité de la référence maîtresse et aucun élément de sa grille ou de son interface.",
  ].join("\n");
}

/** Create one complete, vertically oriented, clickable TOK poster per mailing. */
export function buildTokMailingVisualPrompt(brief: string): string {
  return [
    "Produire UNE affiche email TOK autonome, verticale 9:16, avec toute la direction artistique et les textes DANS L'IMAGE. La sortie est une image unique et non une page HTML, grille ou maquette de téléphone.",
    "Respecter l'image de référence : fond ivoire clair, orange vif #FF4B11, titres noirs énormes condensés, sous-titre orange, filets orange, bloc bas orange avec deux accroches et bouton noir Découvrir TOK, logo TOK Miamz! en haut et thetok.ch en pied.",
    "Le personnage est le chef TOK 3D fidèle aux références : moustache noire, lunettes noires, toque blanche logo TOK, foulard rouge, veste blanche, tablier noir à bord orange, pantalon à carreaux et chaussures noires. Il adapte UNIQUEMENT sa pose, les objets tenus et son geste au thème précis de l'email, sans changer son identité.",
    "Le brief de l'email indique explicitement le titre, l'argument, le corps, l'appel à action et les informations autorisées. Reproduire avec exactitude les mots, accents, montants et la ponctuation du brief. Ne pas inventer de chiffres, de promesses ni de promotions.",
    "Sur mobile, la même image est réduite proportionnellement sans recadrage. Favoriser un titre très lisible, un corps bref, des marges internes confortables et des contrastes élevés. Conserver une zone de sécurité de 7% pour le logo et les textes.",
    "Un SEUL fichier image final. Ne jamais produire une planche multi-affiches. Aucun élément de navigateur, aucune barre d'interface, aucun encadrement factice.",
    "BRIEF ACTUEL : ", brief.slice(0, 6000),
  ].join("\n");
}
