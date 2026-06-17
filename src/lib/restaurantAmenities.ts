export type RestaurantAmenityOption = {
  id: string;
  label: string;
  description: string;
};

export type RestaurantAmenityGroup = {
  id: string;
  title: string;
  description: string;
  options: RestaurantAmenityOption[];
};

export const RESTAURANT_AMENITY_GROUPS: RestaurantAmenityGroup[] = [
  {
    id: "parking-access",
    title: "Stationnement et accès",
    description: "Informations utiles avant l'arrivée sur place.",
    options: [
      { id: "free_parking", label: "Parking gratuit", description: "Places gratuites dédiées ou à proximité." },
      { id: "paid_parking", label: "Parking payant", description: "Parking public ou privé payant proche." },
      { id: "street_parking", label: "Stationnement dans la rue", description: "Places disponibles dans les rues voisines." },
      { id: "wheelchair_accessible", label: "Accès handicapé", description: "Entrée et circulation adaptées." },
      { id: "wheelchair_accessible_restroom", label: "Toilettes accessibles", description: "Sanitaires accessibles aux personnes à mobilité réduite." },
    ],
  },
  {
    id: "comfort-connectivity",
    title: "Confort et connectivité",
    description: "Services attendus pendant le repas.",
    options: [
      { id: "free_wifi", label: "Wi-Fi gratuit", description: "Connexion client disponible gratuitement." },
      { id: "terrace", label: "Terrasse", description: "Tables disponibles en extérieur." },
      { id: "air_conditioning", label: "Climatisation", description: "Salle climatisée en saison chaude." },
      { id: "power_outlets", label: "Prises électriques", description: "Prises accessibles pour ordinateur ou téléphone." },
      { id: "private_room", label: "Salle privée", description: "Espace réservé aux groupes ou événements." },
    ],
  },
  {
    id: "families-pets",
    title: "Familles et animaux",
    description: "Accueil des familles, enfants et compagnons.",
    options: [
      { id: "pets_allowed", label: "Animaux acceptés", description: "Animaux admis sous conditions de l'établissement." },
      { id: "high_chairs", label: "Chaises enfant", description: "Chaises hautes disponibles." },
      { id: "kids_menu", label: "Menu enfant", description: "Offres adaptées aux enfants." },
      { id: "changing_table", label: "Table à langer", description: "Espace change pour bébé." },
      { id: "stroller_friendly", label: "Poussettes acceptées", description: "Accès et emplacement adaptés." },
    ],
  },
  {
    id: "ordering-pickup",
    title: "Commande et retrait",
    description: "Options pratiques autour de la commande.",
    options: [
      { id: "drive_in", label: "Drive-in", description: "Retrait possible sans quitter le véhicule." },
      { id: "curbside_pickup", label: "Retrait devant le restaurant", description: "Remise rapide devant l'établissement." },
      { id: "counter_pickup", label: "Comptoir express", description: "File ou comptoir dédié aux retraits." },
      { id: "late_service", label: "Service tardif", description: "Service disponible en fin de soirée." },
      { id: "group_friendly", label: "Groupes acceptés", description: "Accueil adapté aux grandes tables." },
    ],
  },
];

export function normalizeRestaurantAmenities(amenities: unknown) {
  if (!Array.isArray(amenities)) return [];
  return amenities.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function getRestaurantAmenityOptions(amenities: unknown) {
  const selected = new Set(normalizeRestaurantAmenities(amenities));
  return RESTAURANT_AMENITY_GROUPS
    .flatMap((group) => group.options)
    .filter((option) => selected.has(option.id));
}
