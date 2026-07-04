import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";

type DemoMenuItem = {
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
};

type DemoAccount = {
  username: string;
  password: string;
  email: string;
  fullName: string;
  phone: string;
  city: string;
  address: string;
  prospectObjectId: number;
  restaurant: {
    name: string;
    legalName: string;
    slug: string;
    description: string;
    cuisineType: string;
    address: string;
    city: string;
    postalCode: string;
    phone: string;
    latitude: number;
    longitude: number;
    imageUrl: string;
    gallery: string[];
    menu: DemoMenuItem[];
  };
};

const DEMO_ROLES = ["client", "restaurateur", "commercial"] as const;

const COMMERCIAL_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "commercial01",
    password: "commercial01",
    email: "commercial01@demo.thetok.ch",
    fullName: "Commercial TOK 01",
    phone: "+41790000001",
    city: "Geneve",
    address: "Rue du Rhone 10, 1204 Geneve",
    prospectObjectId: 990001,
    restaurant: {
      name: "Bistro Demo Jet",
      legalName: "Bistro Demo Jet Sarl",
      slug: "bistro-demo-jet-commercial01",
      description: "Bistro genevois de demonstration avec service midi, soir, reservation, emporter et galerie pre-remplie.",
      cuisineType: "Bistro, Francais, Suisse",
      address: "Quai du General-Guisan 24",
      city: "Geneve",
      postalCode: "1204",
      phone: "+41227000101",
      latitude: 46.2049,
      longitude: 6.1515,
      imageUrl: "/images/filets de perche.jpg",
      gallery: ["/images/filets de perche.jpg", "/images/fondue-moitie-moitie.jpg", "/images/salade-du-marche.jpg"],
      menu: [
        { name: "Filets de perche demo", description: "Filets de perche, sauce citron, frites maison.", price: 32, category: "Plats", image_url: "/images/filets de perche.jpg" },
        { name: "Fondue moitie-moitie", description: "Fondue cremeuse, pain artisanal et cornichons.", price: 28, category: "Suggestions", image_url: "/images/fondue-moitie-moitie.jpg" },
        { name: "Salade du marche", description: "Legumes croquants, graines et vinaigrette TOK.", price: 18, category: "Entrees", image_url: "/images/salade-du-marche.jpg" },
      ],
    },
  },
  {
    username: "commercial02",
    password: "commercial02",
    email: "commercial02@demo.thetok.ch",
    fullName: "Commercial TOK 02",
    phone: "+41790000002",
    city: "Carouge",
    address: "Rue Saint-Joseph 12, 1227 Carouge",
    prospectObjectId: 990002,
    restaurant: {
      name: "Trattoria Demo Carouge",
      legalName: "Trattoria Demo Carouge Sarl",
      slug: "trattoria-demo-carouge-commercial02",
      description: "Cuisine italienne conviviale avec pates fraiches, pinsa, formules midi et reservations.",
      cuisineType: "Italien, Pates, Pizza",
      address: "Rue Vautier 7",
      city: "Carouge",
      postalCode: "1227",
      phone: "+41227000102",
      latitude: 46.1845,
      longitude: 6.1396,
      imageUrl: "/images/pasta-assortment.jpeg",
      gallery: ["/images/pasta-assortment.jpeg", "/images/pizza quatre fromage.jpg", "/images/pannacotta.webp"],
      menu: [
        { name: "Pates fraiches demo", description: "Assortiment de pates maison, sauce tomate et basilic.", price: 24, category: "Pates", image_url: "/images/pasta-assortment.jpeg" },
        { name: "Pizza quatre fromages", description: "Mozzarella, gorgonzola, taleggio et parmesan.", price: 22, category: "Pizzas", image_url: "/images/pizza quatre fromage.jpg" },
        { name: "Panna cotta vanille", description: "Dessert italien, coulis de fruits rouges.", price: 9, category: "Desserts", image_url: "/images/pannacotta.webp" },
      ],
    },
  },
  {
    username: "commercial03",
    password: "commercial03",
    email: "commercial03@demo.thetok.ch",
    fullName: "Commercial TOK 03",
    phone: "+41790000003",
    city: "Geneve",
    address: "Boulevard Carl-Vogt 31, 1205 Geneve",
    prospectObjectId: 990003,
    restaurant: {
      name: "Burger Demo Plainpalais",
      legalName: "Burger Demo Plainpalais Sarl",
      slug: "burger-demo-plainpalais-commercial03",
      description: "Smash burgers, chicken croustillant, offres flash et commande a emporter pour demo commerciale.",
      cuisineType: "Burger, Americain, Street Food",
      address: "Boulevard Carl-Vogt 65",
      city: "Geneve",
      postalCode: "1205",
      phone: "+41227000103",
      latitude: 46.2001,
      longitude: 6.1372,
      imageUrl: "/images/gourmet-burgers.jpeg",
      gallery: ["/images/gourmet-burgers.jpeg", "/images/smash-burgers.jpeg", "/images/chicken-bucket-fries.jpeg"],
      menu: [
        { name: "Smash burger TOK", description: "Double smash, cheddar, pickles et sauce maison.", price: 19, category: "Burgers", image_url: "/images/smash-burgers.jpeg" },
        { name: "Chicken crispy", description: "Poulet croustillant, salade, sauce epicee douce.", price: 18, category: "Burgers", image_url: "/images/crispy-chicken.jpeg" },
        { name: "Onion rings", description: "Beignets d'oignons croustillants a partager.", price: 8, category: "Sides", image_url: "/images/onion rings.jpg" },
      ],
    },
  },
  {
    username: "commercial04",
    password: "commercial04",
    email: "commercial04@demo.thetok.ch",
    fullName: "Commercial TOK 04",
    phone: "+41790000004",
    city: "Geneve",
    address: "Rue de Lausanne 82, 1202 Geneve",
    prospectObjectId: 990004,
    restaurant: {
      name: "Thai Demo Paquis",
      legalName: "Thai Demo Paquis Sarl",
      slug: "thai-demo-paquis-commercial04",
      description: "Cuisine thai genereuse, curry, pad thai, reservation rapide et horaires de service complets.",
      cuisineType: "Thai, Curry, Street Food",
      address: "Rue des Paquis 41",
      city: "Geneve",
      postalCode: "1201",
      phone: "+41227000104",
      latitude: 46.2112,
      longitude: 6.1463,
      imageUrl: "/images/thai-spread.jpeg",
      gallery: ["/images/thai-spread.jpeg", "/images/thai-pad-thai.jpeg", "/images/thai-curry-spread.jpeg"],
      menu: [
        { name: "Pad thai demo", description: "Nouilles sautees, crevettes, cacahuetes et citron vert.", price: 23, category: "Plats", image_url: "/images/thai-pad-thai.jpeg" },
        { name: "Curry rouge", description: "Curry coco, legumes croquants et riz jasmin.", price: 24, category: "Plats", image_url: "/images/thai-curry-spread.jpeg" },
        { name: "Mango lassi", description: "Boisson douce a la mangue.", price: 7, category: "Boissons", image_url: "/images/mango lassi.jpeg" },
      ],
    },
  },
  {
    username: "commercial05",
    password: "commercial05",
    email: "commercial05@demo.thetok.ch",
    fullName: "Commercial TOK 05",
    phone: "+41790000005",
    city: "Geneve",
    address: "Rue du 31-Decembre 15, 1207 Geneve",
    prospectObjectId: 990005,
    restaurant: {
      name: "Sushi Demo Eaux-Vives",
      legalName: "Sushi Demo Eaux-Vives Sarl",
      slug: "sushi-demo-eaux-vives-commercial05",
      description: "Sushi, rolls, gyozas et formules soir avec disponibilites de reservation configurees.",
      cuisineType: "Japonais, Sushi, Healthy",
      address: "Rue des Eaux-Vives 28",
      city: "Geneve",
      postalCode: "1207",
      phone: "+41227000105",
      latitude: 46.2024,
      longitude: 6.1638,
      imageUrl: "/images/salmon roll.webp",
      gallery: ["/images/salmon roll.webp", "/images/california roll.jpg", "/images/gyoza porc.webp"],
      menu: [
        { name: "Salmon rolls", description: "Rolls saumon, avocat, sesame et sauce soja.", price: 21, category: "Sushi", image_url: "/images/salmon roll.webp" },
        { name: "California rolls", description: "Crabe, avocat, concombre et tobiko.", price: 19, category: "Sushi", image_url: "/images/california roll.jpg" },
        { name: "Gyoza porc", description: "Gyozas grilles, sauce ponzu.", price: 12, category: "Entrees", image_url: "/images/gyoza porc.webp" },
      ],
    },
  },
  {
    username: "commercial06",
    password: "commercial06",
    email: "commercial06@demo.thetok.ch",
    fullName: "Commercial TOK 06",
    phone: "+41790000006",
    city: "Geneve",
    address: "Avenue Wendt 34, 1203 Geneve",
    prospectObjectId: 990006,
    restaurant: {
      name: "Grill Demo Nations",
      legalName: "Grill Demo Nations Sarl",
      slug: "grill-demo-nations-commercial06",
      description: "Grillades, rotisserie, service continu et menu pre-rempli pour presentation restaurateur.",
      cuisineType: "Grillades, Americain, Familial",
      address: "Rue de Vermont 9",
      city: "Geneve",
      postalCode: "1202",
      phone: "+41227000106",
      latitude: 46.2224,
      longitude: 6.1391,
      imageUrl: "/images/mixed-grill-platter.jpeg",
      gallery: ["/images/mixed-grill-platter.jpeg", "/images/rotisserie-chicken.jpeg", "/images/burgers-wings.jpeg"],
      menu: [
        { name: "Mixed grill demo", description: "Assortiment de viandes grillees, frites et sauces.", price: 34, category: "Plats", image_url: "/images/mixed-grill-platter.jpeg" },
        { name: "Poulet rotisserie", description: "Poulet roti, jus court et pommes grenailles.", price: 25, category: "Plats", image_url: "/images/rotisserie-chicken.jpeg" },
        { name: "Burgers wings", description: "Mini burgers et wings a partager.", price: 26, category: "A partager", image_url: "/images/burgers-wings.jpeg" },
      ],
    },
  },
  {
    username: "commercial07",
    password: "commercial07",
    email: "commercial07@demo.thetok.ch",
    fullName: "Commercial TOK 07",
    phone: "+41790000007",
    city: "Geneve",
    address: "Rue des Bains 25, 1205 Geneve",
    prospectObjectId: 990007,
    restaurant: {
      name: "Brunch Demo Jonction",
      legalName: "Brunch Demo Jonction Sarl",
      slug: "brunch-demo-jonction-commercial07",
      description: "Brunch, cafe, bowls et desserts avec creneaux midi et commandes configurees.",
      cuisineType: "Brunch, Cafe, Healthy",
      address: "Rue de la Coulouvreniere 19",
      city: "Geneve",
      postalCode: "1204",
      phone: "+41227000107",
      latitude: 46.2027,
      longitude: 6.1355,
      imageUrl: "/images/acai bowl.jpg",
      gallery: ["/images/acai bowl.jpg", "/images/poke-bowls.jpeg", "/images/smoothie vert.jpg"],
      menu: [
        { name: "Acai bowl", description: "Acai, fruits frais, granola et miel.", price: 16, category: "Brunch", image_url: "/images/acai bowl.jpg" },
        { name: "Poke bowl vert", description: "Riz, legumes croquants, avocat et sauce sesame.", price: 22, category: "Bowls", image_url: "/images/poke-bowls.jpeg" },
        { name: "Smoothie vert", description: "Pomme, epinard, citron et gingembre.", price: 8, category: "Boissons", image_url: "/images/smoothie vert.jpg" },
      ],
    },
  },
  {
    username: "commercial08",
    password: "commercial08",
    email: "commercial08@demo.thetok.ch",
    fullName: "Commercial TOK 08",
    phone: "+41790000008",
    city: "Geneve",
    address: "Rue de Montbrillant 20, 1201 Geneve",
    prospectObjectId: 990008,
    restaurant: {
      name: "Mezze Demo Cornavin",
      legalName: "Mezze Demo Cornavin Sarl",
      slug: "mezze-demo-cornavin-commercial08",
      description: "Assiettes mezze, wraps et service rapide avec demonstration anti-attente.",
      cuisineType: "Libanais, Mediterranee, Halal",
      address: "Rue de Lausanne 18",
      city: "Geneve",
      postalCode: "1201",
      phone: "+41227000108",
      latitude: 46.2119,
      longitude: 6.1437,
      imageUrl: "/images/lebanese-mezze.jpeg",
      gallery: ["/images/lebanese-mezze.jpeg", "/images/houmous.webp", "/images/falafel wrap.jpeg"],
      menu: [
        { name: "Assiette mezze", description: "Houmous, taboule, falafels, pain pita.", price: 24, category: "Plats", image_url: "/images/lebanese-mezze.jpeg" },
        { name: "Houmous maison", description: "Pois chiches, tahini, citron et huile d'olive.", price: 10, category: "Entrees", image_url: "/images/houmous.webp" },
        { name: "Wrap falafel", description: "Falafels, crudites, sauce sesame.", price: 15, category: "Sandwichs", image_url: "/images/falafel wrap.jpeg" },
      ],
    },
  },
  {
    username: "commercial09",
    password: "commercial09",
    email: "commercial09@demo.thetok.ch",
    fullName: "Commercial TOK 09",
    phone: "+41790000009",
    city: "Geneve",
    address: "Avenue De-Luserna 11, 1203 Geneve",
    prospectObjectId: 990009,
    restaurant: {
      name: "Pizzeria Demo Servette",
      legalName: "Pizzeria Demo Servette Sarl",
      slug: "pizzeria-demo-servette-commercial09",
      description: "Pizzeria de quartier avec livraison, emporter, reservation et offres promotionnelles de demo.",
      cuisineType: "Pizza, Italien, Familial",
      address: "Rue de la Servette 76",
      city: "Geneve",
      postalCode: "1202",
      phone: "+41227000109",
      latitude: 46.2164,
      longitude: 6.1353,
      imageUrl: "/images/calzone.webp",
      gallery: ["/images/calzone.webp", "/images/pizza quatre fromage.jpg", "/images/bruschetta.jpg"],
      menu: [
        { name: "Calzone demo", description: "Calzone jambon, mozzarella, champignons.", price: 21, category: "Pizzas", image_url: "/images/calzone.webp" },
        { name: "Pizza quatre fromages", description: "Fromages italiens et pate croustillante.", price: 22, category: "Pizzas", image_url: "/images/pizza quatre fromage.jpg" },
        { name: "Bruschetta", description: "Pain grille, tomates, basilic et huile d'olive.", price: 11, category: "Entrees", image_url: "/images/bruschetta.jpg" },
      ],
    },
  },
  {
    username: "commercial10",
    password: "commercial10",
    email: "commercial10@demo.thetok.ch",
    fullName: "Commercial TOK 10",
    phone: "+41790000010",
    city: "Geneve",
    address: "Rue Pierre-Fatio 8, 1204 Geneve",
    prospectObjectId: 990010,
    restaurant: {
      name: "Cantine Demo Rive",
      legalName: "Cantine Demo Rive Sarl",
      slug: "cantine-demo-rive-commercial10",
      description: "Cantine premium, plats du jour et tableau de bord pret pour les demonstrations commerciales.",
      cuisineType: "Francais, Healthy, Business Lunch",
      address: "Rue du Rhone 80",
      city: "Geneve",
      postalCode: "1204",
      phone: "+41227000110",
      latitude: 46.2029,
      longitude: 6.1569,
      imageUrl: "/images/octopus-fine-dining.jpeg",
      gallery: ["/images/octopus-fine-dining.jpeg", "/images/salade-du-marche.jpg", "/images/tarte aux noix.webp"],
      menu: [
        { name: "Plat signature demo", description: "Assiette de saison, dressage premium et sauce courte.", price: 36, category: "Plats", image_url: "/images/octopus-fine-dining.jpeg" },
        { name: "Salade business", description: "Salade complete, legumes, graines et proteines.", price: 19, category: "Midi", image_url: "/images/salade-du-marche.jpg" },
        { name: "Tarte aux noix", description: "Dessert maison, caramel leger.", price: 10, category: "Desserts", image_url: "/images/tarte aux noix.webp" },
      ],
    },
  },
];

function openingHours() {
  const weekday = { open: "10:30", close: "22:30", closed: false };
  const saturday = { open: "11:00", close: "23:00", closed: false };
  const sunday = { open: "11:30", close: "21:30", closed: false };

  return {
    timezone: "Europe/Zurich",
    lundi: weekday,
    mardi: weekday,
    mercredi: weekday,
    jeudi: weekday,
    vendredi: weekday,
    samedi: saturday,
    dimanche: sunday,
    service_settings: {
      lunch: {
        start_time: "11:30",
        end_time: "14:30",
        last_reservation_time: "14:00",
        order_start_time: "11:15",
        order_end_time: "14:30",
        slot_interval_minutes: 30,
        max_covers: 48,
        min_party_size: 1,
        max_party_size: 12,
        online_booking_enabled: true,
        online_ordering_enabled: true,
        service_closed: false,
        orders_closed: false,
        service_note: "Service midi demo TOK",
      },
      dinner: {
        start_time: "18:30",
        end_time: "22:30",
        last_reservation_time: "21:45",
        order_start_time: "18:15",
        order_end_time: "22:00",
        slot_interval_minutes: 30,
        max_covers: 60,
        min_party_size: 1,
        max_party_size: 12,
        online_booking_enabled: true,
        online_ordering_enabled: true,
        service_closed: false,
        orders_closed: false,
        service_note: "Service soir demo TOK",
      },
    },
    special_closures: [],
  };
}

async function findUserByEmail(adminClient: any, email: string) {
  const targetEmail = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, error.message);

    const user = data?.users?.find((entry: any) => entry.email?.toLowerCase() === targetEmail);
    if (user) return user;

    if (!data?.users || data.users.length < 1000) break;
  }

  return null;
}

async function ensureAuthUser(adminClient: any, account: DemoAccount) {
  const existingUser = await findUserByEmail(adminClient, account.email);
  const metadata = {
    username: account.username,
    full_name: account.fullName,
    role: "commercial",
    demo_account: true,
    demo_scope: "commercial_sales_environment",
  };

  if (existingUser?.id) {
    const { data, error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
      password: account.password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { demo_account: true },
    });
    if (error) throw new HttpError(500, error.message);
    return data.user;
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: { demo_account: true },
  });
  if (error || !data?.user) {
    throw new HttpError(500, error?.message || `Unable to create ${account.email}`);
  }

  return data.user;
}

async function upsertProfiles(adminClient: any, userId: string, account: DemoAccount) {
  const [firstName, ...rest] = account.fullName.split(" ");
  const lastName = rest.join(" ");

  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      user_id: userId,
      full_name: account.fullName,
      phone: account.phone,
      city: account.city,
      address: account.address,
    }, { onConflict: "user_id" });

  if (profileError) throw new HttpError(500, profileError.message);

  const { error: userProfileError } = await adminClient
    .from("user_profiles")
    .upsert({
      user_id: userId,
      first_name: firstName,
      last_name: lastName || null,
      phone_number: account.phone,
      avatar_url: "/event-logos/logotok1.webp",
    }, { onConflict: "user_id" });

  if (userProfileError) throw new HttpError(500, userProfileError.message);
}

async function upsertRoles(adminClient: any, userId: string) {
  const { error } = await adminClient
    .from("user_roles")
    .upsert(
      DEMO_ROLES.map((role) => ({ user_id: userId, role })),
      { onConflict: "user_id,role" },
    );

  if (error) throw new HttpError(500, error.message);
}

async function ensureRestaurant(adminClient: any, userId: string, account: DemoAccount) {
  const restaurant = account.restaurant;
  const existing = await adminClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .eq("slug", restaurant.slug)
    .maybeSingle();

  if (existing.error) throw new HttpError(500, existing.error.message);

  const payload = {
    owner_id: userId,
    name: restaurant.name,
    legal_name: restaurant.legalName,
    description: restaurant.description,
    cuisine_type: restaurant.cuisineType,
    address: restaurant.address,
    city: restaurant.city,
    phone: restaurant.phone,
    image_url: restaurant.imageUrl,
    rating: 4.8,
    review_count: 128,
    avg_rating: 4.8,
    rating_count: 128,
    price_range: 2,
    is_active: true,
    is_featured: true,
    delivery_available: true,
    delivery_fee: 0,
    base_delivery_fee: 0,
    min_order_amount: 10,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    points_multiplier: 1.2,
    slug: restaurant.slug,
    supports_pickup: true,
    supports_dinein: true,
    supports_reservation: true,
    supports_group_orders: true,
    supports_scheduled: true,
    supports_scheduled_orders: true,
    status: "active",
    opening_hours: openingHours(),
    disabled_dashboard_features: [],
  };

  if (existing.data?.id) {
    const { data, error } = await adminClient
      .from("restaurants")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (error) throw new HttpError(500, error.message);
    return data.id as string;
  }

  const { data, error } = await adminClient
    .from("restaurants")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new HttpError(500, error.message);
  return data.id as string;
}

async function ensureBranch(adminClient: any, restaurantId: string, account: DemoAccount) {
  const restaurant = account.restaurant;
  const existing = await adminClient
    .from("restaurant_branches")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("name", "Restaurant principal")
    .maybeSingle();

  if (existing.error) throw new HttpError(500, existing.error.message);

  const payload = {
    restaurant_id: restaurantId,
    name: "Restaurant principal",
    address: restaurant.address,
    city: restaurant.city,
    postal_code: restaurant.postalCode,
    country: "CH",
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    phone_number: restaurant.phone,
    is_active: true,
  };

  if (existing.data?.id) {
    const { data, error } = await adminClient
      .from("restaurant_branches")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (error) throw new HttpError(500, error.message);
    return data.id as string;
  }

  const { data, error } = await adminClient
    .from("restaurant_branches")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data.id as string;
}

async function seedHours(adminClient: any, branchId: string) {
  const dayRows = [
    { day_of_week: 0, open_time: "11:30", close_time: "21:30", is_closed: false },
    { day_of_week: 1, open_time: "10:30", close_time: "22:30", is_closed: false },
    { day_of_week: 2, open_time: "10:30", close_time: "22:30", is_closed: false },
    { day_of_week: 3, open_time: "10:30", close_time: "22:30", is_closed: false },
    { day_of_week: 4, open_time: "10:30", close_time: "22:30", is_closed: false },
    { day_of_week: 5, open_time: "10:30", close_time: "22:30", is_closed: false },
    { day_of_week: 6, open_time: "11:00", close_time: "23:00", is_closed: false },
  ].map((row) => ({ ...row, branch_id: branchId }));

  const deleteResult = await adminClient
    .from("restaurant_hours")
    .delete()
    .eq("branch_id", branchId);
  if (deleteResult.error) throw new HttpError(500, deleteResult.error.message);

  const { error } = await adminClient.from("restaurant_hours").insert(dayRows);
  if (error) throw new HttpError(500, error.message);
}

async function seedFloorPlan(adminClient: any, branchId: string) {
  const tables = [
    { table_number: "T1", capacity: 2, sector: "Salle principale", layout: { x: 52, y: 72, w: 132, h: 92, shape: "round", rotation: 0, seat_labels: [2] } },
    { table_number: "T2", capacity: 4, sector: "Salle principale", layout: { x: 218, y: 76, w: 156, h: 104, shape: "rect", rotation: 0, seat_labels: [2, 2] } },
    { table_number: "T3", capacity: 4, sector: "Salle principale", layout: { x: 420, y: 78, w: 156, h: 104, shape: "rect", rotation: 0, seat_labels: [2, 2] } },
    { table_number: "T4", capacity: 6, sector: "Vitrine", layout: { x: 80, y: 250, w: 190, h: 112, shape: "rect", rotation: 0, seat_labels: [3, 3] } },
    { table_number: "T5", capacity: 8, sector: "Salon", layout: { x: 340, y: 248, w: 220, h: 126, shape: "rect", rotation: 0, seat_labels: [4, 4] } },
  ];

  for (const table of tables) {
    const existing = await adminClient
      .from("reservation_tables")
      .select("id")
      .eq("branch_id", branchId)
      .eq("table_number", table.table_number)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, existing.error.message);

    const payload = {
      branch_id: branchId,
      table_number: table.table_number,
      capacity: table.capacity,
      sector: table.sector,
      layout: table.layout,
      is_active: true,
    };

    const result = existing.data?.id
      ? await adminClient.from("reservation_tables").update(payload).eq("id", existing.data.id)
      : await adminClient.from("reservation_tables").insert(payload);

    if (result.error) throw new HttpError(500, result.error.message);
  }
}

async function seedMenu(adminClient: any, restaurantId: string, account: DemoAccount) {
  for (const item of account.restaurant.menu) {
    const existing = await adminClient
      .from("menu_items")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("name", item.name)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, existing.error.message);

    const payload = {
      restaurant_id: restaurantId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      image_url: item.image_url,
      is_available: true,
      is_exclusive: false,
      exclusive_type: null,
    };

    const result = existing.data?.id
      ? await adminClient.from("menu_items").update(payload).eq("id", existing.data.id)
      : await adminClient.from("menu_items").insert(payload);

    if (result.error) throw new HttpError(500, result.error.message);
  }
}

async function seedMedia(adminClient: any, restaurantId: string, userId: string, account: DemoAccount) {
  for (const [index, mediaUrl] of account.restaurant.gallery.entries()) {
    const existing = await adminClient
      .from("restaurant_media")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("media_url", mediaUrl)
      .maybeSingle();
    if (existing.error) throw new HttpError(500, existing.error.message);

    const payload = {
      restaurant_id: restaurantId,
      media_url: mediaUrl,
      media_type: "photo",
      alt_text: `${account.restaurant.name} demo ${index + 1}`,
      is_cover: index === 0,
      position: index,
      uploaded_by: userId,
    };

    const result = existing.data?.id
      ? await adminClient.from("restaurant_media").update(payload).eq("id", existing.data.id)
      : await adminClient.from("restaurant_media").insert(payload);

    if (result.error) throw new HttpError(500, result.error.message);
  }
}

async function seedRestaurantSettings(adminClient: any, restaurantId: string, userId: string) {
  const settingsResult = await adminClient
    .from("restaurant_settings")
    .upsert({
      restaurant_id: restaurantId,
      auto_accept_orders: true,
      print_orders_automatically: false,
      pos_integration_provider: null,
    }, { onConflict: "restaurant_id" });
  if (settingsResult.error) throw new HttpError(500, settingsResult.error.message);

  const staff = await adminClient
    .from("restaurant_staff")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (staff.error) throw new HttpError(500, staff.error.message);

  if (staff.data?.id) {
    const { error } = await adminClient
      .from("restaurant_staff")
      .update({ role: "owner" })
      .eq("id", staff.data.id);
    if (error) throw new HttpError(500, error.message);
  } else {
    const { error } = await adminClient
      .from("restaurant_staff")
      .insert({ restaurant_id: restaurantId, user_id: userId, role: "owner" });
    if (error) throw new HttpError(500, error.message);
  }
}

async function seedCommercialAccounting(adminClient: any, userId: string, restaurantId: string, account: DemoAccount) {
  const profileResult = await adminClient
    .from("commercial_compensation_profiles")
    .upsert({
      user_id: userId,
      status: "sprint",
      sprint_started_at: new Date().toISOString().slice(0, 10),
      employment_active: false,
      notes: "Compte de demonstration commercial TOK.",
    }, { onConflict: "user_id" });
  if (profileResult.error) throw new HttpError(500, profileResult.error.message);

  const followupResult = await adminClient
    .from("commercial_prospect_followups")
    .upsert({
      source_objectid: account.prospectObjectId,
      status: "signed",
      notes: "Restaurant demo provisionne pour presentation commerciale.",
      assigned_to: userId,
      last_contacted_by: userId,
      signed_by: userId,
      assigned_to_name: account.fullName,
      last_contacted_by_name: account.fullName,
      signed_by_name: account.fullName,
      signed_at: new Date().toISOString(),
      visited_at: new Date().toISOString(),
      signed_restaurant_id: restaurantId,
      signed_subscription_plan_slug: "pro",
      signed_subscription_plan_name: "TOK Pro",
      signed_subscription_billing_period: "monthly",
      signed_subscription_monthly_price_chf: 129,
      signed_subscription_contract_value_chf: 1548,
      acquisition_commission_rate: 0.1,
      acquisition_commission_chf: 154.8,
      commercial_compensation_mode: "commission_only",
      reservation_commission_rate: 0,
      reservation_commission_starts_at: null,
    }, { onConflict: "source_objectid" });
  if (followupResult.error) throw new HttpError(500, followupResult.error.message);
}

async function provisionOne(adminClient: any, account: DemoAccount) {
  const authUser = await ensureAuthUser(adminClient, account);
  const userId = authUser.id;

  await upsertProfiles(adminClient, userId, account);
  await upsertRoles(adminClient, userId);
  const restaurantId = await ensureRestaurant(adminClient, userId, account);
  const branchId = await ensureBranch(adminClient, restaurantId, account);
  await seedHours(adminClient, branchId);
  await seedFloorPlan(adminClient, branchId);
  await seedMenu(adminClient, restaurantId, account);
  await seedMedia(adminClient, restaurantId, userId, account);
  await seedRestaurantSettings(adminClient, restaurantId, userId);
  await seedCommercialAccounting(adminClient, userId, restaurantId, account);

  return {
    username: account.username,
    email: account.email,
    code: account.password,
    user_id: userId,
    restaurant_id: restaurantId,
    restaurant_name: account.restaurant.name,
    roles: [...DEMO_ROLES],
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("provision-commercial-demo-logins");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    actor = await authenticateRequest(req, { allowServiceRole: true });
    requireRole(actor, ["admin"]);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    if (dryRun) {
      return jsonResponse({
        ok: true,
        dry_run: true,
        count: COMMERCIAL_DEMO_ACCOUNTS.length,
        credentials: COMMERCIAL_DEMO_ACCOUNTS.map((account) => ({
          username: account.username,
          email: account.email,
          code: account.password,
          restaurant_name: account.restaurant.name,
          roles: [...DEMO_ROLES],
        })),
      }, 200, corsHeaders);
    }

    const credentials = [];
    for (const account of COMMERCIAL_DEMO_ACCOUNTS) {
      credentials.push(await provisionOne(actor.adminClient, account));
    }

    log.info("commercial_demo_accounts_provisioned", {
      count: credentials.length,
      actor_user_id: actor.userId,
      auth_mode: actor.authMode,
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "provision-commercial-demo-logins",
      action: "provision",
      status: "success",
      targetEntityType: "commercial_demo_accounts",
      metadata: {
        count: credentials.length,
        usernames: credentials.map((entry) => entry.username),
      },
    });

    return jsonResponse({
      ok: true,
      count: credentials.length,
      credentials,
    }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Internal error";

    log.error("commercial_demo_provision_failed", { message });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "provision-commercial-demo-logins",
      action: "provision",
      status: "failure",
      targetEntityType: "commercial_demo_accounts",
      errorMessage: message,
    }).catch(() => {});

    return jsonResponse({ ok: false, error: message }, status, corsHeaders);
  }
});

export { COMMERCIAL_DEMO_ACCOUNTS, DEMO_ROLES };
