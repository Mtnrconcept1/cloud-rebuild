import type { MarketingChannelId } from "@/marketing/types";

export type MarketingPostPreviewData = {
  caption: string;
  visualUrl: string | null;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function marketingPreviewImageUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Keep Meta caption composition aligned with the publisher, including tag deduplication. */
export function marketingPostPreview(content: unknown, channel: MarketingChannelId): MarketingPostPreviewData {
  const row = content && typeof content === "object" && !Array.isArray(content)
    ? content as Record<string, unknown> : {};
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const tag of Array.isArray(row.hashtags) ? row.hashtags : []) {
    const normalized = text(tag).replace(/^#+/, "").replace(/\s+/g, "");
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) continue;
    seen.add(normalized.toLocaleLowerCase());
    hashtags.push(`#${normalized}`);
    if (hashtags.length >= 30) break;
  }
  const structured = [text(row.headline), text(row.body), text(row.call_to_action), hashtags.join(" ")]
    .filter(Boolean).join("\n\n");
  const fallback = text(content) || text(row.message) || text(row.body) || text(row.text) || text(row.summary);
  return {
    caption: channel === "instagram" || channel === "facebook" ? structured || fallback : fallback || structured,
    visualUrl: marketingPreviewImageUrl(row.visual_url),
  };
}
