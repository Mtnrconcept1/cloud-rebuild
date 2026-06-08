import type { CartItem } from "@/lib/cart-context";

export type SuggestedMenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
};

export type HistoricalOrderItemForSuggestions = {
  menu_item_id: string | null;
  quantity?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type HistoricalOrderForSuggestions = {
  id?: string;
  created_at?: string | null;
  status?: string | null;
  payment_status?: string | null;
  order_items?: HistoricalOrderItemForSuggestions[] | null;
};

export type ScoredCartSuggestion = SuggestedMenuItem & {
  score: number;
  reason: string;
};

type AddOnRole = "dessert" | "drink" | "starter" | "other";

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(value: unknown) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function itemSignalText(item: CartItem) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return [
    item.name,
    item.restaurantName,
    metadata.category,
    metadata.category_name,
    metadata.cuisine,
    metadata.cuisine_type,
    Array.isArray(metadata.tags) ? metadata.tags.join(" ") : "",
  ].filter(Boolean).join(" ");
}

function suggestionSignalText(item: SuggestedMenuItem) {
  return `${item.name} ${item.description || ""} ${item.category || ""}`;
}

function classifyAddOnRole(value: unknown): AddOnRole {
  const text = normalizeText(value);

  if (/dessert|glace|tiramisu|gateau|chocolat|fondant|fruit|sweet|sucre|panna|mousse/.test(text)) {
    return "dessert";
  }

  if (/boisson|drink|coca|soda|eau|jus|the|cafe|limonade|sirop|lassi|mocktail|cocktail/.test(text)) {
    return "drink";
  }

  if (/entree|starter|salade|soupe|tapas|meze|mezze|bruschetta|aperitif|apero|houmous|samoussa|nems/.test(text)) {
    return "starter";
  }

  return "other";
}

function buildCartSignals(items: CartItem[]) {
  const tokens = new Set<string>();
  const categories = new Set<string>();
  const addOnRoles = new Set<AddOnRole>();

  for (const item of items) {
    const signalText = itemSignalText(item);

    for (const token of tokenize(signalText)) {
      tokens.add(token);
    }

    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const category = normalizeText(metadata.category || metadata.category_name);
    if (category) categories.add(category);

    const role = classifyAddOnRole(signalText);
    if (role !== "other") addOnRoles.add(role);
  }

  return { tokens, categories, addOnRoles };
}

function shouldUseHistoricalOrder(order: HistoricalOrderForSuggestions) {
  const status = normalizeText(order.status);
  const paymentStatus = normalizeText(order.payment_status);
  const combined = `${status} ${paymentStatus}`;

  return !/(cancel|annul|failed|echec|expired|expire|abandon|refund|rembours)/.test(combined);
}

function buildHistoricalItemScores(orderHistory: HistoricalOrderForSuggestions[]) {
  const scores = new Map<string, number>();

  orderHistory.forEach((order, orderIndex) => {
    if (!shouldUseHistoricalOrder(order)) return;

    const recencyScore = Math.max(0, 30 - orderIndex * 3);
    const items = Array.isArray(order.order_items) ? order.order_items : [];

    for (const item of items) {
      const menuItemId = typeof item.menu_item_id === "string" ? item.menu_item_id : "";
      if (!menuItemId) continue;

      const quantity = Math.max(1, Number(item.quantity || 1));
      scores.set(menuItemId, (scores.get(menuItemId) || 0) + 90 + recencyScore + Math.min(quantity * 6, 24));
    }
  });

  return scores;
}

function getMissingAddOnReason(role: AddOnRole) {
  if (role === "dessert") return "Dessert a ajouter si vous n'en avez pas encore";
  if (role === "drink") return "Boisson a ajouter si vous n'en avez pas encore";
  if (role === "starter") return "Entree a ajouter si vous n'en avez pas encore";
  return null;
}

function getSuggestionReason(item: SuggestedMenuItem, scoreParts: {
  historicalScore: number;
  fillsFreeDelivery: boolean;
  categoryMatch: boolean;
  tokenMatches: number;
  missingAddOnRole: AddOnRole;
}) {
  if (scoreParts.historicalScore > 0) return "Deja commande dans ce restaurant";

  const missingReason = getMissingAddOnReason(scoreParts.missingAddOnRole);
  if (missingReason) return missingReason;

  if (scoreParts.fillsFreeDelivery) return "Aide a atteindre la livraison offerte";
  if (scoreParts.categoryMatch || scoreParts.tokenMatches > 0) return "Proche des produits deja choisis";
  return item.category ? `Suggestion ${item.category}` : "Suggestion du restaurant";
}

function scoreSuggestion(
  item: SuggestedMenuItem,
  signals: ReturnType<typeof buildCartSignals>,
  historicalScores: Map<string, number>,
  missingForFreeDelivery: number | null,
): ScoredCartSuggestion {
  const itemText = suggestionSignalText(item);
  const itemTokens = tokenize(itemText);
  const itemCategory = normalizeText(item.category);
  const tokenMatches = itemTokens.filter((token) => signals.tokens.has(token)).length;
  const categoryMatch = Boolean(itemCategory && signals.categories.has(itemCategory));
  const addOnRole = classifyAddOnRole(itemText);
  const missingAddOnRole = addOnRole !== "other" && !signals.addOnRoles.has(addOnRole) ? addOnRole : "other";
  const fillsFreeDelivery = Boolean(missingForFreeDelivery && Number(item.price) >= missingForFreeDelivery);
  const price = Number(item.price) || 0;
  const historicalScore = historicalScores.get(item.id) || 0;

  const score = [
    historicalScore,
    missingAddOnRole === "dessert" ? 42 : 0,
    missingAddOnRole === "drink" ? 38 : 0,
    missingAddOnRole === "starter" ? 34 : 0,
    fillsFreeDelivery ? 28 : 0,
    categoryMatch ? 18 : 0,
    Math.min(tokenMatches * 8, 24),
    price > 0 && price <= 8 ? 8 : 0,
    price > 8 && price <= 18 ? 4 : 0,
  ].reduce((sum, value) => sum + value, 0);

  return {
    ...item,
    score,
    reason: getSuggestionReason(item, {
      historicalScore,
      fillsFreeDelivery,
      categoryMatch,
      tokenMatches,
      missingAddOnRole,
    }),
  };
}

export function buildCartSuggestions({
  currentItems,
  menuItems,
  orderHistory = [],
  missingForFreeDelivery,
  limit = 6,
}: {
  currentItems: CartItem[];
  menuItems: SuggestedMenuItem[];
  orderHistory?: HistoricalOrderForSuggestions[];
  missingForFreeDelivery: number | null;
  limit?: number;
}) {
  const currentItemIds = new Set(currentItems.map((item) => item.menuItemId));
  const signals = buildCartSignals(currentItems);
  const historicalScores = buildHistoricalItemScores(orderHistory);

  return menuItems
    .filter((item) => !currentItemIds.has(item.id))
    .map((item) => scoreSuggestion(item, signals, historicalScores, missingForFreeDelivery))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.price) - Number(b.price);
    })
    .slice(0, limit);
}
