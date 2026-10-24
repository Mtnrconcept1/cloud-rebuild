/** TOK-owned campaigns only. Never apply this profile to restaurant-owned studios. */
export const TOK_MARKETING_BRAND_VERSION = "tok-v3-creme-orange-20261020";
export const TOK_MARKETING_CREATIVE_VERSION = "tok-da-b-dynamic-impact-20261022";
export const TOK_MARKETING_STYLE_SCORE_MIN = 0.85;
export const TOK_MARKETING_NOVELTY_SCORE_MIN = 0.70;

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
    "Créer UNE seule publication TOK indépendante, au format " + format + ", avec UNE seule scène et UN seul fichier final, à partir des " + TOK_MARKETING_REFERENCES.length + " images jointes.",
    "DA B TOK — PRINCIPE MAÎTRE : la première image jointe, Profil Instagram TOK, est la référence maîtresse d'identité et d'énergie visuelle, jamais un gabarit à recopier. Reproduce the visual language, not the layout. Never copy the composition of a reference image. References define brand identity, contrast, photographic treatment, typography personality, color relationships and energy only. Create a completely new composition appropriate to the current subject.",
    "Ne jamais reproduire la grille, les séparations, l'interface Instagram, les boutons ou une mise en page complète d'une référence. Aucune mosaïque, planche contact, collage multiscène ou montage de plusieurs visuels. Ne pas copier le corps d'email, les boutons, les prix ou les textes commerciaux de l'affiche Studio marketing.",
    "GRAMMAIRE FIXE : orange vermillon TOK, crème ivoire chaud, noir profond et blanc cassé ; contraste élevé ; photographie culinaire réaliste et très appétissante ; énergie publicitaire premium ; aplats, arches arrondies et courts gestes de pinceau ; hiérarchie typographique forte ; identité genevoise/local food lorsque le sujet le justifie. Aucun accent jaune, bleu ou violet. Une touche verte est autorisée uniquement si le brief parle explicitement d'anti-gaspi, recyclage ou durabilité.",
    "VARIABLES OBLIGATOIRES D'UN POST À L'AUTRE : fond clair, sombre ou photographique ; emplacement du titre en haut, centre, latéral ou tiers inférieur ; titre noir, blanc ou orange selon le contraste ; échelle du sujet ; présence du chef, d'un smartphone, d'un restaurant, de Genève, d'un plat ou d'humains uniquement lorsque la direction créative le demande. Ne pas imposer le même coin de texte, la même arche, la même photo ou la même proportion à chaque génération.",
    "Logo : reprendre fidèlement le disque orange TOK, le liseré blanc, TOK blanc et la toque blanche ; conserver la petite bulle Miamz! et la moustache noire des références. Un seul logo principal, intact et lisible, peut changer de position selon la composition mais reste dans la zone de sécurité. Aucun logo tiers ni logo TOK réinventé.",
    "ZONE DE SÉCURITÉ IMPÉRATIVE : placer le logo principal complet, le titre et le pied thetok.ch dans le rectangle central, à au moins " + TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT + " % de chacun des quatre bords. Mesurer les contours visibles, liseré, bulle Miamz!, accents et ponctuation inclus. Cette zone prime sur les positions exactes des références. Les fonds, photographies, arches et filets décoratifs peuvent atteindre les bords.",
    "Typographie : sans empattement très grasse et légèrement condensée, titres en casse phrase ou capitales expressives lorsque la direction le demande, sauf que TOK reste conforme au logo. Le texte fourni par le brief doit être reproduit exactement dans son contenu, accents et ponctuation compris ; les retours à la ligne, la casse visuelle, la couleur et la position peuvent varier. Aucun paragraphe long sur l'image. Lisibilité immédiate à taille de téléphone.",
    "Composition : une seule idée principale. Alterner volontairement photo food héroïque, ambiance restaurant, téléphone/app, typographie dominante, Genève/local, fonctionnalité illustrée, humain/lifestyle, macro culinaire, affiche éditoriale ou minimalisme crème selon la direction du brief. Un discret thetok.ch en pied, dans la zone de sécurité ; pas de CTA, QR code ou paragraphe ajouté.",
    "CHEF CONDITIONNEL : uniquement si le brief le demande ou l'autorise explicitement. Sinon aucun personnage cartoon hors logo. Quand il est présent : chef 3D fidèle aux références, visage chaleureux, grand sourire, moustache noire recourbée, lunettes noires, toque blanche avec emblème TOK, veste blanche à boutons noirs, foulard rouge, tablier noir bordé de rouge et pantalon à carreaux noir/blanc. Varier pose et cadrage ; ne pas réutiliser systématiquement le même geste.",
    "PRODUCTION NATIVE : tous les textes, logo et éléments artistiques doivent être générés dans l'image. Aucun ajout ultérieur en HTML, CSS, SVG, Canvas, Python ou collage. Seuls le redimensionnement proportionnel, la compression et le renommage sont permis après génération.",
    "Ne reprendre AUCUN prix concurrent, remise, statistique, récompense, interface chiffrée, QR code ni badge app-store des références. Utiliser exclusivement les faits explicitement fournis dans le brief courant ; en cas d'absence, omettre. Ne pas ajouter de promesse commerciale.",
    "BRIEF COURANT — il définit le sujet, le texte exact et la direction créative ; il ne remplace jamais la charte ci-dessus :",
    brief.slice(0, 1800),
    "CONTRÔLE FINAL : un seul visuel et une seule scène ; bon ratio ; logo fidèle ; texte français exact et lisible ; direction créative respectée ; chef seulement si demandé ; identité DA B évidente sans copier la composition d'une référence.",
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
