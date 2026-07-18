import { invokeSupabaseFunction } from "@/lib/session";

const FUNCTION_NAME = "daily-dish-ai";
const REQUEST_TIMEOUT_MS = 135_000;

export type DailyDishSupplierSource = {
  url: string;
  title: string;
  retailer: string;
  checked_at: string;
};

export type DailyDishVariantPayload = {
  name: string;
  description: string;
  why_it_fits: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  allergens: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  basket: Array<{
    ingredient: string;
    quantity: number;
    unit: string;
    retailer: string;
    product: string;
    package_size: string;
    package_price_chf: number;
    allocated_cost_chf: number;
    url: string;
    availability_note: string;
    distance_note: string;
  }>;
  recipe: Array<{ step: number; instruction: string; minutes: number }>;
  estimated_total_cost_chf: number;
  cost_per_portion_chf: number;
  suggested_price_chf: number;
  food_cost_percent: number;
  estimated_margin_chf: number;
  image_prompt: string;
  actualite_copy: string;
  sources: DailyDishSupplierSource[];
  price_caveat: string;
};

export type DailyDishVariant = {
  id: string;
  run_id?: string;
  restaurant_id?: string;
  variant_number?: number;
  revision: number;
  parent_variant_id?: string | null;
  status: "proposed" | "refined" | "selected" | "published" | "archived";
  payload: DailyDishVariantPayload;
  created_at?: string;
};

export type DailyDishRun = {
  id: string;
  restaurant_id: string;
  generation_date: string;
  status: "generating" | "completed" | "failed";
  model?: string | null;
  sources?: DailyDishSupplierSource[];
  error_code?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

export type DailyDishSettings = {
  restaurant_id?: string;
  is_enabled: boolean;
  timezone: string;
  target_food_cost_bps: number;
  preferred_supplier_domains?: string[];
  dietary_notes?: string;
  updated_at?: string | null;
};

export type DailyDishStatus = {
  access: { enabled: boolean; plan: string; reason: string | null };
  settings: DailyDishSettings;
  run: DailyDishRun | null;
  variants: DailyDishVariant[];
  demo: boolean;
};

type BaseRequest = {
  restaurant_id: string;
  session_id?: string | null;
};

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  throw new Error("Ce navigateur ne permet pas de sécuriser la requête IA.");
}

async function invokeDailyDish<T>(body: Record<string, unknown>) {
  const { data, error } = await invokeSupabaseFunction<T>(FUNCTION_NAME, {
    body,
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Réponse invalide du service Plat du jour IA.");
  return data;
}

export function getDailyDishStatus(input: BaseRequest) {
  return invokeDailyDish<DailyDishStatus>({ action: "status", ...input });
}

export function setDailyDishEnabled(input: BaseRequest & { is_enabled: boolean }) {
  return invokeDailyDish<{ settings?: DailyDishSettings; is_enabled?: boolean; demo: boolean }>({
    action: "set_enabled",
    ...input,
  });
}

export function generateDailyDishProposals(input: BaseRequest & { demo_context?: Record<string, unknown> }) {
  return invokeDailyDish<{
    run: DailyDishRun;
    variants: DailyDishVariant[];
    replayed?: boolean;
    demo: boolean;
  }>({
    action: "generate",
    request_id: createRequestId(),
    ...input,
  });
}

export function refineDailyDishProposal(input: BaseRequest & {
  variant_id?: string;
  variant?: DailyDishVariantPayload;
  revision?: number;
  instruction: string;
}) {
  return invokeDailyDish<{ variant: DailyDishVariant; demo: boolean }>({
    action: "refine",
    ...input,
  });
}

export function selectDailyDishProposal(input: BaseRequest & { variant_id: string }) {
  return invokeDailyDish<{ selected: boolean; variant_id?: string; demo: boolean }>({
    action: "select",
    ...input,
  });
}

export function publishDailyDishProposal(input: BaseRequest & {
  variant_id: string;
  asset_id: string;
  price_cents: number;
  description: string;
  publish_actualite: boolean;
  actualite_body: string;
}) {
  return invokeDailyDish<{
    published: boolean;
    publication?: { dish_id: string; post_id?: string | null; service_date: string; image_url: string };
    demo: boolean;
  }>({
    action: "publish",
    ...input,
  });
}

export function formatDailyDishError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("premium_required")) return "Cette fonctionnalité est incluse dès l’abonnement TOK Premium.";
  if (message.includes("daily_dish_disabled")) return "Activez d’abord le Plat du jour IA.";
  if (message.includes("daily_dish_generation_in_progress")) return "La recherche du jour est déjà en cours.";
  if (message.includes("supplier_prices_unavailable")) return "Aucun prix fournisseur suffisamment vérifiable n’a été trouvé. Réessayez plus tard.";
  if (message.includes("daily_dish_revision_limit")) return "La limite de cinq demandes de modification est atteinte pour cette proposition.";
  if (message.includes("ai_rate_limited") || message.includes("rate_limited")) return "Trop de recherches ont été lancées. Patientez quelques minutes.";
  if (message.includes("ai_timeout") || message.toLowerCase().includes("timeout")) return "La comparaison des fournisseurs a pris trop de temps. Réessayez.";
  return message || "Le service Plat du jour IA est momentanément indisponible.";
}
