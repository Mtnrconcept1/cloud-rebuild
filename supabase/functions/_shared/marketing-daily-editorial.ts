import {
  TOK_MARKETING_BRAND_VERSION,
  TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT,
  TOK_MARKETING_REFERENCES,
} from "./marketing-brand.ts";

/** The daily format is fixed at 1024 × 1280 px (see readDailyJpegDimensions). */
const DAILY_IMAGE_WIDTH = 1024;
const DAILY_IMAGE_HEIGHT = 1280;
/** Restaurateur landing page; publication adds the UTM parameters to this link. */
export const DAILY_CAPTION_URL = "https://www.thetok.ch/restaurateurs/geneve";

const DAY_MS = 86_400_000;
const EDITORIAL_EPOCH = Date.parse("2026-10-19T00:00:00.000Z");

/** The reference contains two mascot compositions among nine independent posts. */
export const TOK_DAILY_VISUAL_FAMILIES = [
  { id: "orange-white", label: "Orange et titre blanc", requiresChef: false, direction: "Aplat orange vermillon vif, titre blanc cassé, court soulignement au pinceau crème et détail d'arche ivoire. Composition typographique épurée, sans photo, sans mascotte." },
  { id: "food-photo", label: "Photographie culinaire", requiresChef: false, direction: "Une seule photographie réaliste de plat, restaurant chaleureux flou. Zone ivoire supérieure courbe, titre noir très gras, court soulignement au pinceau orange et arche orange latérale ; ne pas masquer le plat." },
  { id: "cream-detail", label: "Crème et détail de table", requiresChef: false, direction: "Fond crème ivoire chaud, titre noir et filet orange fin. Une table en trois quarts avec un détail du service : carte orange vierge, assiette ou couverts. Une seule nature morte, sans interface inventée." },
  { id: "human-service", label: "Le service en situation", requiresChef: false, direction: "Une seule photographie réaliste d'une personne de l'équipe accueillant ou servant des clients. Geste naturel, lumière ambrée, titre blanc dans une zone calme. Aucune mascotte." },
  { id: "chef-dark", label: "Chef TOK sur fond noir", requiresChef: true, direction: "Chef TOK 3D fidèle à la référence Studio, sur fond noir profond devant une arche orange arrondie, geste accueillant lié au thème. Titre blanc, court soulignement au pinceau orange. Une seule mascotte, une seule composition." },
  { id: "cream-menu", label: "Crème et carte gourmande", requiresChef: false, direction: "Fond crème ivoire, titre noir et court soulignement orange dans une zone supérieure courbe. Un plat réaliste près d'un téléphone affichant uniquement sa photo, sans texte, chiffre ou interface inventés ; arche orange latérale. Une seule scène de table cohérente." },
  { id: "orange-black", label: "Orange et titre noir", requiresChef: false, direction: "Aplat orange vermillon vif, titre noir très gras, court soulignement au pinceau crème et détail d'arche ivoire. Sans photo, sans mascotte, sans autre décoration." },
  { id: "chef-cream", label: "Chef TOK sur fond crème", requiresChef: true, direction: "Chef TOK 3D fidèle à la référence Studio sur fond crème ivoire, devant une arche orange arrondie, présentant un plat ou une tablette montrant seulement une photo culinaire. Titre noir, court soulignement orange, geste expressif. Une seule mascotte, aucun collage." },
  { id: "restaurant-photo", label: "Ambiance du restaurant", requiresChef: false, direction: "Une seule photographie réaliste de salle ou terrasse accueillante : tables dressées, bois, verre, lumière chaude. Titre blanc sur une zone sombre. Aucun autre logo ni enseigne." },
] as const;

/**
 * Copy is tied to capabilities visible in the repository, with no prices,
 * quantified outcomes, customer testimonials or promises of feature availability.
 * Keep promotional claims here reviewable; do not let the image model invent them.
 */
export const TOK_DAILY_EDITORIAL_SUBJECTS = [
  {
    id: "reservations", label: "Organiser les réservations",
    // src/pages/dashboard/DashboardReservations.tsx
    titles: ["Vos réservations. Bien organisées.", "Les réservations trouvent leur place.", "Gardez vos réservations en vue.", "Votre service commence bien organisé.", "Un regard sur vos réservations.", "Préparez chaque service plus sereinement.", "Vos réservations, au même endroit.", "La journée commence bien organisée."],
    captions: ["Consultez les réservations de votre restaurant dans TOK et préparez votre prochain service. Les informations utiles restent réunies dans votre espace restaurateur.", "Un service se prépare avant l’arrivée des clients. Retrouvez vos réservations dans TOK pour organiser leur accueil."],
    context: "La préparation des tables avant l'arrivée des clients ; aucune réservation réelle, aucun nom client.",
    hashtag: "#Reservations",
  },
  {
    id: "cuisine", label: "Mettre la cuisine en valeur",
    titles: ["Votre cuisine. Le goût d’abord.", "Le savoir-faire se voit aussi.", "Vos plats méritent la lumière.", "La gourmandise commence au regard.", "Votre cuisine raconte votre histoire.", "Chaque plat a sa personnalité.", "Le goût commence par l’envie.", "Donnez la vedette à vos plats."],
    captions: ["Un beau plat raconte déjà quelque chose de votre restaurant. Donnez à votre cuisine une place de choix dans votre présentation sur TOK.", "Les couleurs, les textures et le dressage donnent envie de découvrir une carte. Mettez votre cuisine en valeur dans votre espace TOK."],
    context: "Le soin apporté au dressage et aux textures d'un plat, sans prétendre montrer le plat d'un établissement réel.",
    hashtag: "#Cuisine",
  },
  {
    id: "menu", label: "Présenter la carte",
    // src/pages/dashboard/DashboardMenu.tsx
    titles: ["Votre carte. À l’honneur.", "Une carte qui vous ressemble.", "Vos spécialités prennent leur place.", "Votre carte mérite la lumière.", "Vos plats, prêts à être découverts.", "Présentez simplement vos meilleures idées.", "Votre menu prend des couleurs.", "La carte donne le ton."],
    captions: ["Organisez les plats, les descriptions et les photos de votre carte dans TOK. Une présentation claire aide vos clients à découvrir votre cuisine.", "Votre carte évolue avec votre restaurant. Retrouvez vos plats et leur disponibilité dans votre espace restaurateur TOK."],
    context: "La découverte de la carte et de ses plats ; aucun prix, texte de menu ou écran chiffré à inventer.",
    hashtag: "#CarteDuRestaurant",
  },
  {
    id: "floor-plan", label: "Organiser le plan de salle",
    // src/pages/dashboard/DashboardPlanSalle.tsx
    titles: ["Chaque table trouve sa place.", "Votre salle, bien en vue.", "Une salle pensée pour accueillir.", "Votre plan de salle prend forme.", "L’accueil commence par une table.", "Préparez la salle à votre façon.", "Gardez vos tables en vue.", "La salle se prépare avec soin."],
    captions: ["Le plan de salle TOK permet de représenter les tables de votre restaurant. Préparez l’organisation de votre espace avant le service.", "Chaque restaurant a sa propre salle et ses habitudes. Organisez vos tables dans le plan de salle TOK pour préparer l’accueil des clients."],
    context: "Une table bien dressée ou une salle accueillante ; ne pas inventer de plan fonctionnel ni de taux de remplissage.",
    hashtag: "#PlanDeSalle",
  },
  {
    id: "zero-wait", label: "Découvrir Zéro Attente",
    // src/pages/ZeroAttente.tsx: menu selection and create-zero-attente-reservation.
    titles: ["Le repas se prépare avant l’arrivée.", "La pause de midi se prépare.", "Vos clients choisissent avant d’arriver.", "Le choix commence avant la table.", "Précommander, puis profiter du moment.", "Un repas pensé en avance.", "Préparez l’arrivée, soignez le repas.", "Le déjeuner commence par le choix."],
    captions: ["Avec Zéro Attente, les clients peuvent choisir leurs plats avant de venir au restaurant. Découvrez ce parcours de réservation et de précommande dans TOK.", "Choisir son repas avant l’arrivée, c’est le principe de Zéro Attente. TOK réunit la réservation et la précommande dans ce parcours dédié."],
    context: "Un déjeuner prêt à être dégusté et l'accueil du client ; aucune garantie de délai ou de service immédiat.",
    hashtag: "#ZeroAttente",
  },
  {
    id: "photos", label: "Soigner les photos",
    // src/pages/dashboard/DashboardPhotos.tsx
    titles: ["Vos photos ouvrent l’appétit.", "Montrez ce qui vous rend unique.", "Votre restaurant sous son meilleur jour.", "Une belle photo donne envie.", "Faites entrer votre cuisine dans l’image.", "Votre univers mérite de belles images.", "Les détails racontent votre restaurant.", "Vos spécialités attirent le regard."],
    captions: ["La galerie TOK rassemble les photos de votre restaurant. Choisissez les images qui montrent votre cuisine, votre salle et votre personnalité.", "Une belle lumière et un cadrage soigné mettent les détails en valeur. Présentez votre restaurant avec les photos de votre galerie TOK."],
    context: "Les textures d'un plat et les détails chaleureux de la salle ; aucune comparaison avant/après.",
    hashtag: "#PhotoCulinaire",
  },
  {
    id: "marketing-studio", label: "Créer avec le Studio marketing",
    // src/components/dashboard/TokAiMarketingStudio.tsx
    titles: ["Vos idées. Notre créativité.", "Faites parler de votre restaurant.", "Votre prochain visuel commence ici.", "Une identité qui se reconnaît.", "Donnez une image à vos idées.", "Votre restaurant garde son style.", "Des visuels à votre image.", "Faites vivre votre univers en images."],
    captions: ["Une nouveauté à présenter ou une idée à partager ? Préparez vos visuels à partir de votre brief et de vos références dans le Studio marketing TOK.", "Une communication cohérente commence par une identité claire. Le Studio marketing TOK vous aide à préparer des visuels pour votre restaurant."],
    context: "La créativité culinaire et l'identité du restaurant ; ne pas représenter plusieurs publications dans une même image.",
    hashtag: "#MarketingRestaurant",
  },
  {
    id: "flash-sales", label: "Présenter les ventes flash",
    // src/pages/dashboard/DashboardVentesFlash.tsx
    titles: ["Une offre, au bon moment.", "Faites connaître votre offre du moment.", "Vos offres ont leur moment.", "Donnez rendez-vous aux envies gourmandes.", "Une occasion de découvrir votre cuisine.", "Votre spécialité entre en scène.", "Une idée gourmande à partager.", "Vos nouveautés méritent le détour."],
    captions: ["Une offre ponctuelle mérite une présentation claire. Préparez vos ventes flash dans TOK avec les plats et les disponibilités de votre restaurant.", "Les ventes flash TOK permettent de présenter une offre limitée. Vous définissez ses détails dans votre espace restaurateur."],
    context: "Un plat mis à l'honneur, sans montant, remise, compte à rebours ou fausse urgence.",
    hashtag: "#VentesFlash",
  },
  {
    id: "restaurant-profile", label: "Présenter le restaurant",
    // src/pages/RestaurantDetail.tsx and restaurant profile management.
    titles: ["Votre restaurant a une histoire.", "Faites découvrir votre adresse.", "Votre personnalité commence à la porte.", "Une adresse qui vous ressemble.", "Présentez ce qui fait votre différence.", "Votre univers mérite d’être découvert.", "Donnez envie de pousser la porte.", "Votre restaurant se présente simplement."],
    captions: ["Photos, présentation et informations pratiques racontent votre restaurant. Prenez soin de votre fiche TOK pour aider les clients à vous découvrir.", "Votre adresse a une cuisine, une ambiance et une personnalité. Faites-les découvrir à travers votre fiche restaurant TOK."],
    context: "L'ambiance accueillante d'un restaurant indépendant fictif, sans adresse, nom ni enseigne tierce.",
    hashtag: "#Restaurant",
  },
  {
    id: "anti-waste", label: "Valoriser les invendus",
    // src/pages/AntiGaspi.tsx and restaurant offers.
    titles: ["Les bons plats méritent une suite.", "Vos invendus peuvent encore régaler.", "La gourmandise a encore sa place.", "Donnez une chance aux bonnes choses.", "Moins de gaspillage, toujours du goût.", "Les bonnes choses se partagent.", "Vos préparations méritent d’être dégustées.", "Le goût mérite d’aller jusqu’au bout."],
    captions: ["Présentez vos offres anti-gaspi dans TOK pour valoriser les produits encore disponibles. Les détails de chaque offre restent ceux que vous choisissez.", "Une préparation encore disponible peut trouver sa place dans une offre anti-gaspi. Découvrez cette possibilité pour votre restaurant sur TOK."],
    context: "Une préparation fraîche et appétissante soigneusement présentée ; aucun produit abîmé ni promesse chiffrée de réduction du gaspillage.",
    hashtag: "#AntiGaspi",
  },
  {
    id: "orders", label: "Suivre les commandes",
    // src/pages/dashboard/DashboardCommandes.tsx
    titles: ["Vos commandes, au bon endroit.", "Gardez le fil des commandes.", "Chaque commande reste en vue.", "Un regard sur vos commandes.", "Retrouvez les détails de chaque commande.", "Vos commandes suivent leur chemin.", "La préparation commence par une commande.", "Votre service garde ses repères."],
    captions: ["Retrouvez vos commandes par jour et par statut dans TOK. Les informations de chaque commande sont réunies dans votre espace restaurateur.", "Un suivi clair aide à retrouver les détails utiles pendant le service. Consultez les commandes de votre restaurant dans TOK."],
    context: "La préparation soignée d'un plat et son passage vers la salle ; aucun ticket réel ni donnée de client.",
    hashtag: "#Commandes",
  },
  {
    id: "restaurant-news", label: "Partager les actualités",
    // src/pages/dashboard/DashboardActualites.tsx
    titles: ["Votre restaurant a des nouvelles.", "Partagez la vie de votre restaurant.", "Vos nouveautés prennent la parole.", "Racontez ce qui se prépare.", "Une nouvelle idée à faire découvrir.", "Faites connaître vos prochains rendez-vous.", "Vos actualités méritent une place.", "Votre restaurant continue son histoire."],
    captions: ["Une nouvelle carte ou un moment à partager ? Préparez une actualité dans votre espace TOK pour raconter la vie de votre restaurant.", "Votre restaurant évolue au fil des saisons et des idées. Partagez vos nouveautés avec les actualités TOK."],
    context: "Une ambiance de découverte et un plat mis à l'honneur ; aucune date d'événement ni offre inventée.",
    hashtag: "#ActualitesRestaurant",
  },
  {
    id: "hospitality", label: "Prendre soin de l’accueil",
    titles: ["Du temps pour vos clients.", "L’accueil fait partie du plaisir.", "Le sourire donne le ton.", "Chaque visite mérite de l’attention.", "Le plaisir commence par l’accueil.", "Votre salle attend de belles rencontres.", "L’attention se voit dans les détails.", "La convivialité se prépare chaque jour."],
    captions: ["Un sourire, une table soignée, une attention au bon moment : l’accueil fait partie de l’expérience. TOK met à l’honneur celles et ceux qui font vivre les restaurants.", "Derrière une belle expérience au restaurant, il y a une équipe attentive. Aujourd’hui, place aux gestes simples qui rendent l’accueil chaleureux."],
    context: "La convivialité et un geste d'accueil naturel ; aucune citation ni témoignage attribué à une personne.",
    hashtag: "#Accueil",
  },
  {
    id: "tok-identity", label: "Faire vivre l’identité TOK",
    titles: ["Le service, en plus simple.", "La touche TOK au quotidien.", "Votre restaurant garde sa personnalité.", "La passion du restaurant nous rassemble.", "Votre métier mérite toute l’attention.", "Le restaurant au cœur des idées.", "Votre cuisine reste au premier plan.", "Les bonnes idées prennent place."],
    captions: ["TOK s’adresse à celles et ceux qui font vivre les restaurants. Découvrez un univers pensé autour de la cuisine, de l’accueil et du quotidien des restaurateurs.", "La cuisine a sa personnalité, chaque restaurant aussi. TOK accompagne la présentation et l’organisation de cet univers."],
    context: "L'identité chaleureuse de TOK au service des restaurateurs, sans promesse de revenu ou de résultat.",
    hashtag: "#Restaurateurs",
  },
] as const;

const SCENE_VARIATIONS = [
  "Détail culinaire possible : poisson rôti et légumes colorés, lumière douce du déjeuner.",
  "Détail culinaire possible : assiette végétale généreuse, lumière ambrée du restaurant.",
  "Détail culinaire possible : pâtes fraîches dressées avec soin, bois et verre en arrière-plan.",
  "Détail culinaire possible : dessert maison élégant, lumière latérale chaleureuse.",
  "Détail culinaire possible : spécialité mijotée dans une belle assiette, ambiance de dîner.",
] as const;

export type DailyMarketingBrief = {
  localDate: string;
  subjectId: typeof TOK_DAILY_EDITORIAL_SUBJECTS[number]["id"];
  subjectLabel: string;
  visualFamily: typeof TOK_DAILY_VISUAL_FAMILIES[number]["id"];
  visualFamilyLabel: string;
  title: string;
  expectedTitle: string;
  caption: string;
  visualPrompt: string;
  requiresChef: boolean;
  format: "4:5";
  brandVersion: string;
  referenceIds: string[];
  variationId: string;
  titleReused: boolean;
};

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export function normalizeDailyMarketingTitle(title: string): string {
  return title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

function editorialDayIndex(localDate: string): number {
  if (typeof localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("marketing_daily_date_invalid");
  }
  // A calendar date is not an instant in the server's timezone. UTC arithmetic
  // deliberately keeps each local calendar day one step apart, including DST.
  const timestamp = Date.parse(`${localDate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== localDate) {
    throw new Error("marketing_daily_date_invalid");
  }
  return Math.floor((timestamp - EDITORIAL_EPOCH) / DAY_MS);
}

/**
 * recentTitles must be newest first. Store this brief with the daily job and
 * reuse it for retries; regenerating against a changed history can pick a new title.
 * Rotation has no end date. If every title is recent, use the least recently
 * seen one and expose titleReused instead of stopping daily production forever.
 */
export function buildDailyMarketingBrief(localDate: string, recentTitles: string[] = []): DailyMarketingBrief {
  const dayIndex = editorialDayIndex(localDate);
  const subject = TOK_DAILY_EDITORIAL_SUBJECTS[modulo(dayIndex, TOK_DAILY_EDITORIAL_SUBJECTS.length)];
  const family = TOK_DAILY_VISUAL_FAMILIES[modulo(dayIndex, TOK_DAILY_VISUAL_FAMILIES.length)];
  const subjectRound = Math.floor(dayIndex / TOK_DAILY_EDITORIAL_SUBJECTS.length);
  const preferredTitle = modulo(subjectRound, subject.titles.length);
  const history = new Map<string, number>();
  recentTitles.slice(0, 1000).forEach((title, index) => {
    const normalized = normalizeDailyMarketingTitle(title);
    if (normalized && !history.has(normalized)) history.set(normalized, index);
  });
  const candidates = subject.titles.map((_, offset) => modulo(preferredTitle + offset, subject.titles.length));
  const unusedTitle = candidates.find((index) => !history.has(normalizeDailyMarketingTitle(subject.titles[index])));
  const titleIndex = unusedTitle ?? candidates.reduce((oldest, index) => {
    const position = history.get(normalizeDailyMarketingTitle(subject.titles[index])) ?? -1;
    const oldestPosition = history.get(normalizeDailyMarketingTitle(subject.titles[oldest])) ?? -1;
    return position > oldestPosition ? index : oldest;
  }, preferredTitle);
  const title = subject.titles[titleIndex];
  const sceneIndex = modulo(dayIndex, SCENE_VARIATIONS.length);
  const safeX = Math.ceil(DAILY_IMAGE_WIDTH * TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT / 100);
  const safeY = Math.ceil(DAILY_IMAGE_HEIGHT * TOK_MARKETING_GENERATION_SAFE_MARGIN_PERCENT / 100);
  const caption = [
    title,
    subject.captions[modulo(subjectRound, subject.captions.length)],
    `Restaurateurs à Genève : découvrez TOK sur ${DAILY_CAPTION_URL}`,
    `#TOK #RestaurateursGeneve #Geneve #RestaurantGeneve ${subject.hashtag}`,
    // No third-party @ mention: these posts feature TOK capabilities, not a
    // verified restaurant or partner. Never invent affiliation for distribution.
  ].join("\n\n");
  const visualPrompt = [
    `Publication Instagram quotidienne TOK du ${localDate}. Audience : restaurateurs francophones. Format 4:5.`,
    // Models copy the corner placement of the references; concrete pixels are followed more reliably than percentages.
    `Pour cette image de ${DAILY_IMAGE_WIDTH} × ${DAILY_IMAGE_HEIGHT} px : logo principal, titre et pied thetok.ch entièrement dans le rectangle x ${safeX}–${DAILY_IMAGE_WIDTH - safeX} px, y ${safeY}–${DAILY_IMAGE_HEIGHT - safeY} px. Ne pas reprendre la position du logo dans le coin des références si elle sort de ce rectangle.`,
    `Sujet : ${subject.label}. Un seul bénéfice, exprimé par le titre exact suivant : ${JSON.stringify(title)}.`,
    "Textes autorisés : le titre exact, TOK et la bulle Miamz! dans le logo, thetok.ch discret en pied. Ne générer aucun autre texte. La légende reste hors de l'image.",
    `Famille visuelle imposée : ${family.id} — ${family.direction}`,
    family.requiresChef
      ? "Mascotte chef TOK obligatoire, strictement identique aux références maîtresses."
      : "Aucune mascotte ni personnage cartoon dans cette publication, en dehors du pictogramme du logo TOK.",
    `Contexte : ${subject.context}`,
    `${SCENE_VARIATIONS[sceneIndex]} À utiliser uniquement si la famille prévoit une photo ou un plat ; ne rien ajouter aux aplats typographiques.`,
    "Réutiliser explicitement la référence maîtresse Profil Instagram TOK jointe et les références du chef/logo à chaque génération. La grille fournie est un guide de style, jamais le résultat attendu.",
    "Une seule scène, une seule image indépendante ; texte et logo produits nativement, pas de montage, pas d'ajout ultérieur. La première référence et la charte TOK restent prioritaires.",
  ].join("\n");

  return {
    localDate,
    subjectId: subject.id,
    subjectLabel: subject.label,
    visualFamily: family.id,
    visualFamilyLabel: family.label,
    title,
    expectedTitle: title,
    caption,
    visualPrompt,
    requiresChef: family.requiresChef,
    format: "4:5",
    brandVersion: TOK_MARKETING_BRAND_VERSION,
    referenceIds: TOK_MARKETING_REFERENCES.map((reference) => reference.id),
    variationId: `${localDate}:${subject.id}:${family.id}:${titleIndex}:${sceneIndex}`,
    titleReused: unusedTitle === undefined,
  };
}
