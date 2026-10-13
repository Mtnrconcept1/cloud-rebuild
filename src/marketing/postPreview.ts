import type { MarketingChannelId } from "@/marketing/types";
import { composeMetaCaption } from "../../supabase/functions/_shared/meta-publishing";

export type MarketingPostPreviewData = {
  caption: string;
  visualUrl: string | null;
  visualFormat?: string;
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
  const structured = composeMetaCaption(row);
  const fallback = text(content) || text(row.message) || text(row.body) || text(row.text) || text(row.summary);
  return {
    caption: channel === "instagram" || channel === "facebook" ? structured || fallback : fallback || structured,
    visualUrl: marketingPreviewImageUrl(row.visual_url),
    ...(text(row.visual_format) ? { visualFormat: text(row.visual_format) } : {}),
  };
}
