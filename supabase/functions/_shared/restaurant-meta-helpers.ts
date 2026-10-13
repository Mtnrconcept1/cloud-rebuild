export type RestaurantMetaChannel = "facebook" | "instagram";

export function normalizeMetaChannels(raw: unknown): RestaurantMetaChannel[] {
  if (!Array.isArray(raw) || raw.length > 2) return [];
  const values = raw.filter((item): item is RestaurantMetaChannel =>
    item === "facebook" || item === "instagram");
  return [...new Set(values)];
}

export function buildRestaurantMetaCaption(title: unknown, body: unknown): string {
  const titleText = typeof title === "string" ? title.trim().slice(0, 200) : "";
  const bodyText = typeof body === "string" ? body.trim().slice(0, 2100) : "";
  return [...new Set([titleText, bodyText].filter(Boolean))].join("\n\n").slice(0, 2200);
}

/** Meta fetches the media server-side: only approved public TOK storage may be passed. */
export function normalizeRestaurantMetaImageUrl(value: unknown, supabaseUrl: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const allowed = new URL(supabaseUrl);
    if (url.protocol !== "https:" || url.origin !== allowed.origin) return null;
    if (!/^\/storage\/v1\/object\/public\/(images|social-post-media)\//.test(url.pathname)) return null;
    if (url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isActiveRestaurantMetaCampaign(status: unknown, paymentStatus: unknown): boolean {
  return status === "active" && paymentStatus === "paid";
}
